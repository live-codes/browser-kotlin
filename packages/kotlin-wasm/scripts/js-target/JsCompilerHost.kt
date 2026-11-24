package editor.compilerhost

import org.jetbrains.kotlin.cli.common.ExitCode
import org.jetbrains.kotlin.cli.common.arguments.parseCommandLineArguments
import org.jetbrains.kotlin.cli.common.messages.CompilerMessageSeverity
import org.jetbrains.kotlin.cli.common.messages.CompilerMessageSourceLocation
import org.jetbrains.kotlin.cli.common.messages.MessageCollector
import org.jetbrains.kotlin.cli.js.K2JSCompiler
import org.jetbrains.kotlin.config.Services
import java.io.ByteArrayInputStream
import java.io.DataInputStream
import java.io.File
import java.nio.file.Files
import java.nio.file.Path
import java.util.Base64
import kotlin.io.path.createDirectories
import kotlin.io.path.deleteRecursively
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.isDirectory
import kotlin.io.path.isRegularFile
import kotlin.io.path.name
import kotlin.io.path.readBytes
import kotlin.io.path.readText
import kotlin.io.path.walk
import kotlin.io.path.writeBytes
import kotlin.io.path.writeText

private const val JS_FILE_NAME = "main.kt"

/**
 * Compatibility shims compiled alongside the program, each in its own file
 * because a Kotlin file holds one package.
 *
 * A JVM Kotlin program uses `System.out`, `System.exit` and `readLine` freely;
 * none of them exist in Kotlin/JS. Rather than fail on tutorial code, the host
 * supplies them:
 *
 *  - `System` and the line readers live in the default package, so the user calls
 *    them unqualified exactly as on the JVM, with no import.
 *  - They never call their own names: each delegates to an `@JsFun` host hook,
 *    because `println()` inside our own `println()` resolves to itself and
 *    recurses until the stack overflows.
 *  - `package kotlin.io` is reserved for the standard library, so the readers
 *    cannot be added to their real package. The default package is what makes the
 *    unqualified call work anyway.
 */
private val JS_PRELUDE: Map<String, String> = mapOf(
    "system.kt" to """
@JsFun("(text, isErr) => globalThis.__kotlinWrite(text, isErr)")
external fun __kotlinWrite(text: String, isErr: Boolean)

@JsFun("(code) => globalThis.__kotlinExit(code)")
external fun __kotlinExit(code: Int)

object System {
    val out: __KotlinPrintStream = __KotlinPrintStream(false)
    val err: __KotlinPrintStream = __KotlinPrintStream(true)

    fun exit(status: Int) { __kotlinExit(status) }
}

class __KotlinPrintStream(private val isErr: Boolean) {
    fun println(message: Any?) { emit(message.toString() + "\n") }
    fun println() { emit("\n") }
    fun print(message: Any?) { emit(message.toString()) }
    private fun emit(text: String) { __kotlinWrite(text, isErr) }
}
""",
    "stdin.kt" to """
@JsFun("() => globalThis.__kotlinReadLine()")
external fun __kotlinReadLine(): String?

fun readLine(): String? = __kotlinReadLine()
fun readlnOrNull(): String? = __kotlinReadLine()
fun readln(): String = readlnOrNull() ?: throw NoSuchElementException("EOF")
""",
)

/** The user's program, whose diagnostics carry this name. */
private const val JS_MAIN_FILE = JS_FILE_NAME

/**
 * The serialization plugin, registered for every compile.
 *
 * A GraalVM image cannot load classes from a jar at run time, so `-Xcompiler-plugin`
 * cannot point at the real plugin. It does not have to: the plugin classes are
 * baked into the image's own classpath, and the loader only needs a directory
 * whose `META-INF/services` names them. It then reads the registrar from its
 * service file and resolves the class through the image.
 *
 * The directory holds no classes on purpose — a `META-INF/services` entry plus an
 * empty class body is what makes this work in a closed world.
 */
private val SERIALIZATION_PLUGIN_SERVICES: Map<String, String> = mapOf(
    "META-INF/services/org.jetbrains.kotlin.compiler.plugin.CommandLineProcessor" to
        "org.jetbrains.kotlinx.serialization.compiler.extensions.SerializationPluginOptions",
    "META-INF/services/org.jetbrains.kotlin.compiler.plugin.CompilerPluginRegistrar" to
        "org.jetbrains.kotlinx.serialization.compiler.extensions.SerializationComponentRegistrar",
)

private class JsDiagnostic(val severity: String, val message: String, val from: Int, val to: Int)

/** The Kotlin/JS target over one source file, behind the same string protocol as the Wasm host. */
@OptIn(ExperimentalPathApi::class)
class JsCompilerHost(private val root: Path) {
    private val stdlib = root.resolve("lib/stdlib-js")
    private val home = root.resolve("home-js")

    /**
     * Extra libraries the run asked for, as their own -libraries roots.
     *
     * K2 only sees a library that is a separate entry; a klib nested inside
     * another one is invisible, and repeating -libraries replaces the value
     * instead of appending. So each extra library is unpacked next to the
     * standard library and the whole set is passed as one ':'-separated value.
     */
    private val extraLibraries = mutableListOf<Path>()

    init {
        System.setProperty("kotlin.colors.enabled", "false")
        System.setProperty("java.awt.headless", "true")
    }

    fun handle(operation: String, first: String, second: String): String = try {
        when (operation) {
            "init" -> installStandardLibrary(Base64.getDecoder().decode(first))
            // The name is the directory to unpack into, so a run can add several
            // libraries under distinct names (kotlinx-browser, kotlin-test, ...).
            "addLibraries" -> installLibrary(second, Base64.getDecoder().decode(first))
            "compile" -> compile(first)
            else -> error("Unknown operation '$operation'")
        }
    } catch (e: Throwable) {
        jsJson { field("error", e.stackTraceToString()) }
    }

    /**
     * Unpacks a library archive into its own -libraries root.
     *
     * Same format as the standard library archive, so the package ships both the
     * same way. Adding is idempotent per name, so a retry after a failed compile
     * does not unpack twice.
     */
    fun installLibrary(name: String, archive: ByteArray): String {
        val target = root.resolve("lib/extra").resolve(name)
        target.deleteRecursively()
        val input = DataInputStream(ByteArrayInputStream(archive))
        val count = input.readInt()
        repeat(count) {
            val file = target.resolve(input.readUTF())
            file.parent.createDirectories()
            file.writeBytes(ByteArray(input.readInt()).also(input::readFully))
        }
        extraLibraries.removeIf { it == target }
        extraLibraries.add(target)
        return jsJson { field("files", count) }
    }

    fun installStandardLibrary(archive: ByteArray): String {
        val input = DataInputStream(ByteArrayInputStream(archive))
        val count = input.readInt()
        repeat(count) {
            val file = stdlib.resolve(input.readUTF())
            file.parent.createDirectories()
            file.writeBytes(ByteArray(input.readInt()).also(input::readFully))
        }
        home.createDirectories()
        return jsJson { field("files", count) }
    }

    private val commonArguments
        get() = listOf(
            "-kotlin-home", home.toString(),
            "-libraries", (listOf(stdlib) + extraLibraries).joinToString(File.pathSeparator),
            "-ir-output-name", "main",
            "-Xcompiler-plugin=${pluginDirectory()}",
            // The prelude's @JsFun host hooks are the only ever use of this
            // experimental interop; opting in keeps a warning out of every
            // program's diagnostics, where it would look like the user's fault.
            "-opt-in=kotlin.js.ExperimentalWasmJsInterop",
        )

    /**
     * Writes the plugin's service descriptors and returns the directory.
     *
     * Written on first use rather than at construction, so the files exist before
     * the first compile and never go stale. `@Serializable` needs the plugin
     * whether or not the program imports the serialization libraries, so this is
     * not gated on them.
     */
    private fun pluginDirectory(): Path {
        val directory = root.resolve("plugin")
        if (directory.resolve("META-INF").isDirectory()) return directory
        for ((name, content) in SERIALIZATION_PLUGIN_SERVICES) {
            val file = directory.resolve(name)
            file.parent.createDirectories()
            file.writeText(content + "\n")
        }
        return directory
    }

    private fun libraryArguments(klib: Path, sourceFile: Path, preludeFiles: List<Path>) =
        commonArguments +
            listOf("-ir-output-dir", klib.toString(), "-nopack", sourceFile.toString()) +
            preludeFiles.map(Path::toString)

    private fun compile(source: String): String {
        val started = System.currentTimeMillis()
        val work = root.resolve("work-js").apply { deleteRecursively() }
        val src = work.resolve("src").createDirectories()
        val sourceFile = src.resolve(JS_FILE_NAME).apply { writeText(source) }
        val preludeFiles = JS_PRELUDE.map { (name, text) -> src.resolve(name).apply { writeText(text) } }
        val klib = work.resolve("klib")
        val output = work.resolve("js")
        val diagnostics = mutableListOf<JsDiagnostic>()

        var exitCode = runCompiler(libraryArguments(klib, sourceFile, preludeFiles), source, diagnostics)
        if (exitCode == ExitCode.OK) {
            exitCode = runCompiler(
                commonArguments + listOf(
                    "-ir-output-dir", output.toString(),
                    "-Xinclude=$klib",
                    "-module-kind", "es",
                    "-Xir-produce-js",
                    "-Xir-dce",
                ),
                source,
                diagnostics,
            )
        }

        if (exitCode == ExitCode.OK) {
            output.resolve("main.mjs").takeIf { it.isRegularFile() }?.let { passArguments(it) }
        }

        val files = if (exitCode == ExitCode.OK && Files.isDirectory(output)) {
            output.walk().filter { it.isRegularFile() }.sortedBy { it.name }.toList()
        } else {
            emptyList()
        }
        return jsJson {
            field("ok", exitCode == ExitCode.OK)
            field("exitCode", exitCode.name)
            field("milliseconds", System.currentTimeMillis() - started)
            diagnostics(diagnostics)
            array("files", files) { file ->
                field("name", file.name)
                field("content", Base64.getEncoder().encodeToString(file.readBytes()))
            }
        }
    }

    /**
     * Gives `main(args: Array<String>)` the program's arguments.
     *
     * The compiler always emits `main([])` — a browser has no argv — so a
     * program that inspects `args` sees an empty array. Replace that call with the
     * host-provided list. The pattern is asserted: if the emitted shape ever
     * changes, this fails loudly instead of silently dropping argv.
     */
    private fun passArguments(module: Path) {
        val text = module.readText()
        // `main([])` is emitted only when the program declares main(args); a plain
        // main() is called as main() and has nothing to patch. So absence is not a
        // failure — but a module that declares main(args) and never calls it means
        // the output shape changed, and silently dropping argv would be wrong.
        if (!text.contains("main([])")) {
            val declaresArguments = Regex("""function main\((\w+)\)""").containsMatchIn(text)
            if (declaresArguments) {
                error(
                    "This Kotlin/JS module takes main(args) but does not call main([]), so " +
                        "arguments cannot be passed. Update JsCompilerHost.passArguments.",
                )
            }
            return
        }
        module.writeText(text.replace("main([])", "main(globalThis.__kotlinArgs ?? [])"))
    }

    private fun runCompiler(
        arguments: List<String>,
        source: String,
        diagnostics: MutableList<JsDiagnostic>,
    ): ExitCode {
        val lineStarts = jsLineStarts(source)
        fun offset(line: Int, column: Int): Int =
            if (line < 1 || line > lineStarts.size) 0 else (lineStarts[line - 1] + column - 1).coerceIn(0, source.length)

        // Our own shim files are not the user's code: a warning inside them must
        // point at something the user can see, so attribute it to their first line.
        val preludeNames = JS_PRELUDE.keys
        val collector = object : MessageCollector {
            private var errors = false

            override fun clear() {}

            override fun hasErrors(): Boolean = errors

            override fun report(severity: CompilerMessageSeverity, message: String, location: CompilerMessageSourceLocation?) {
                if (severity.isError) errors = true
                if (!severity.isError && !severity.isWarning) return
                // Registering the plugin is experimental and the compiler says so
                // once per argument parse. It is our choice, not the program's,
                // and would otherwise show on every compile.
                if (message.contains("Argument -Xcompiler-plugin is experimental")) return
                val inPrelude = location?.path?.let { path -> preludeNames.any { path.endsWith(it) } } ?: false
                if (inPrelude) {
                    diagnostics += JsDiagnostic(if (severity.isError) "ERROR" else "WARNING", message, 0, 0)
                    return
                }
                val from = location?.let { offset(it.line, it.column) } ?: 0
                val to = location?.takeIf { it.lineEnd > 0 }?.let { offset(it.lineEnd, it.columnEnd) } ?: from
                diagnostics += JsDiagnostic(if (severity.isError) "ERROR" else "WARNING", message, from, maxOf(from, to))
            }
        }
        val compiler = K2JSCompiler()
        val parsed = compiler.createArguments()
        parseCommandLineArguments(arguments, parsed)
        return compiler.exec(collector, Services.EMPTY, parsed)
    }
}

private fun jsLineStarts(text: String): IntArray {
    val starts = mutableListOf(0)
    text.forEachIndexed { index, char -> if (char == '\n') starts += index + 1 }
    return starts.toIntArray()
}

private class JsJson(private val out: StringBuilder) {
    private var empty = true

    private fun key(name: String) {
        if (!empty) out.append(',')
        empty = false
        string(name)
        out.append(':')
    }

    private fun string(value: String) {
        out.append('"')
        for (char in value) {
            when {
                char == '"' -> out.append("\\\"")
                char == '\\' -> out.append("\\\\")
                char == '\n' -> out.append("\\n")
                char == '\r' -> out.append("\\r")
                char == '\t' -> out.append("\\t")
                char < ' ' || char == ' ' || char == ' ' -> out.append("\\u").append(char.code.toString(16).padStart(4, '0'))
                else -> out.append(char)
            }
        }
        out.append('"')
    }

    fun field(name: String, value: String) {
        key(name)
        string(value)
    }

    fun field(name: String, value: Boolean) {
        key(name)
        out.append(value)
    }

    fun field(name: String, value: Number) {
        key(name)
        out.append(value)
    }

    fun <T> array(name: String, items: Iterable<T>, write: JsJson.(T) -> Unit) {
        key(name)
        out.append('[')
        items.forEachIndexed { index, item ->
            if (index > 0) out.append(',')
            out.append('{')
            JsJson(out).write(item)
            out.append('}')
        }
        out.append(']')
    }

    fun diagnostics(diagnostics: List<JsDiagnostic>) = array("diagnostics", diagnostics) {
        field("severity", it.severity)
        field("message", it.message)
        field("from", it.from)
        field("to", it.to)
    }
}

private fun jsJson(write: JsJson.() -> Unit): String = buildString {
    append('{')
    JsJson(this).write()
    append('}')
}
