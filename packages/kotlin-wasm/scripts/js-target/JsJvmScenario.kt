package editor.compilerhost

import java.nio.file.Files
import java.nio.file.Path
import java.nio.file.StandardCopyOption
import java.util.Base64
import kotlin.io.path.createDirectories
import kotlin.io.path.readBytes
import kotlin.io.path.readText
import kotlin.system.exitProcess

private const val JS_HELLO = """
fun greet(name: String): String = "Hello, ${'$'}name!"

fun main() {
    println(greet("JavaScript"))
}
"""

private const val JS_BROKEN = """
fun main() {
    val count: Int = "three"
    println(missing(count))
}
"""

/** Runs the JS compiler host on the JVM; the build also uses this to record image reachability metadata. */
fun main(arguments: Array<String>) {
    val archive = Path.of(arguments[0])
    val sample = Path.of(arguments[1]).readText()
    val output = Path.of(arguments[2]).createDirectories()
    val root = Files.createTempDirectory("compiler-host-js")
    val host = JsCompilerHost(root)
    val failures = mutableListOf<String>()

    fun request(title: String, operation: String, first: String, expected: String): String {
        val answer = host.handle(operation, first, "")
        println("$title: ${answer.take(300)}")
        if (expected !in answer) failures += "$title: expected $expected in ${answer.take(2000)}"
        return answer
    }

    request("init", "init", Base64.getEncoder().encodeToString(archive.readBytes()), "\"files\"")
    request("compile with errors", "compile", JS_BROKEN, "\"severity\":\"ERROR\"")
    request("compile everything", "compile", sample, "\"ok\":true")
    request("compile", "compile", JS_HELLO, "\"ok\":true")

    val jsDir = root.resolve("work-js/js")
    if (Files.isDirectory(jsDir)) {
        Files.walk(jsDir).use { paths ->
            paths.forEach { source ->
                val target = output.resolve(jsDir.relativize(source).toString())
                if (Files.isDirectory(source)) {
                    Files.createDirectories(target)
                } else {
                    Files.copy(source, target, StandardCopyOption.REPLACE_EXISTING)
                }
            }
        }
        println("copied JS output to $output")
    } else {
        failures += "JS output directory was not produced"
    }

    if (failures.isNotEmpty()) {
        failures.forEach(System.err::println)
        exitProcess(1)
    }
    exitProcess(0)
}
