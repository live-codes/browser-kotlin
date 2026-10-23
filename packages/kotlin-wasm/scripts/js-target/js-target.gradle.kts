// Appended to compiler-host/build.gradle.kts by scripts/build-toolchain.sh when TARGET=js.

// ---- JS target ----

val jsStdlibKlib: Configuration by configurations.creating {
    isTransitive = false
    attributes { attribute(Usage.USAGE_ATTRIBUTE, objects.named("kotlin-runtime")) }
}
dependencies {
    jsStdlibKlib("org.jetbrains.kotlin:kotlin-stdlib-js:$kotlinVersion")
}

val jsStdlibArchive = tasks.register("jsStdlibArchive") {
    description = "Packs the Kotlin/JS stdlib klib for the JS host"
    val klib = jsStdlibKlib
    val output = layout.buildDirectory.file("stdlib-js/kotlin-stdlib-js.bin")
    inputs.files(klib)
    outputs.file(output)
    doLast {
        ZipFile(klib.singleFile).use { zip ->
            val entries = zip.entries().asSequence().filter { !it.isDirectory }.sortedBy { it.name }.toList()
            DataOutputStream(output.get().asFile.apply { parentFile.mkdirs() }.outputStream().buffered()).use { out ->
                out.writeInt(entries.size)
                for (entry in entries) {
                    val bytes = zip.getInputStream(entry).use { it.readBytes() }
                    out.writeUTF(entry.name)
                    out.writeInt(bytes.size)
                    out.write(bytes)
                }
            }
        }
    }
}

val jsAgentMetadata = layout.buildDirectory.dir("agentJsMetadata")
val jsOutput = layout.buildDirectory.dir("jsOutput")

val jsJvmScenario = tasks.register<JavaExec>("jsJvmScenario") {
    description = "Compiles JS on the JVM and records what the JS image must keep reachable"
    group = "verification"
    enabled = graalvmHome != null
    executable(graalvmTool("java"))
    classpath = imageClasspath
    mainClass = "editor.compilerhost.JsJvmScenarioKt"
    val archive = jsStdlibArchive.map { it.outputs.files.singleFile }
    inputs.file(archive)
    inputs.file(layout.projectDirectory.file("src/scenario/shapes.kt"))
    outputs.dir(jsAgentMetadata)
    outputs.dir(jsOutput)
    argumentProviders.add {
        listOf(
            archive.get().path,
            layout.projectDirectory.file("src/scenario/shapes.kt").asFile.path,
            jsOutput.get().asFile.path,
        )
    }
    jvmArgumentProviders.add {
        listOf(
            "-agentlib:native-image-agent=config-output-dir=${jsAgentMetadata.get().asFile}/META-INF/native-image/editor/compiler-host-js",
            "--enable-native-access=ALL-UNNAMED",
        )
    }
    doFirst { delete(jsAgentMetadata); delete(jsOutput) }
}

val jsImageDirectory = layout.buildDirectory.dir("jsImage")
val jsHeap = providers.gradleProperty("jsImage.heap").orNull ?: "8g"

val jsWebImage = tasks.register<Exec>("jsWebImage") {
    description = "Compiles the JS-target compiler host to WebAssembly with GraalVM Web Image"
    group = "build"
    enabled = graalvmHome != null
    val classpath = imageClasspath + files(jsAgentMetadata).builtBy(jsJvmScenario)
    inputs.files(classpath)
    inputs.property("debugOptions", debugOptions.toList())
    inputs.property("jsHeap", jsHeap)
    outputs.dir(jsImageDirectory)
    doFirst {
        delete(jsImageDirectory)
        mkdir(jsImageDirectory)
        commandLine(
            graalvmTool("native-image"),
            "--tool:svm-wasm",
            "-J-Xmx${jsHeap}",
            "-Os",
            "-H:+AddAllCharsets",
            "-H:+UnlockExperimentalVMOptions",
            *debugOptions,
            "-H:ImageHeapObjectsPerFunction=20000",
            "--enable-native-access=ALL-UNNAMED",
            "-J--sun-misc-unsafe-memory-access=allow",
            "-cp", classpath.asPath,
            "-o", jsImageDirectory.get().file("kotlin-compiler-js").asFile.path,
            "editor.compilerhost.web.WebMainJs",
        )
    }
    doLast { delete(jsImageDirectory.get().file("kotlin-compiler-js.js.wat")) }
}
