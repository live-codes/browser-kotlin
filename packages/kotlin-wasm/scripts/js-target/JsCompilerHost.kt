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
import java.nio.file.Files
import java.nio.file.Path
import java.util.Base64
import kotlin.io.path.createDirectories
import kotlin.io.path.deleteRecursively
import kotlin.io.path.ExperimentalPathApi
import kotlin.io.path.isRegularFile
import kotlin.io.path.name
import kotlin.io.path.readBytes
import kotlin.io.path.walk
import kotlin.io.path.writeBytes
import kotlin.io.path.writeText

private const val JS_FILE_NAME = "main.kt"

private class JsDiagnostic(val severity: String, val message: String, val from: Int, val to: Int)

/** The Kotlin/JS target over one source file, behind the same string protocol as the Wasm host. */
@OptIn(ExperimentalPathApi::class)
class JsCompilerHost(private val root: Path) {
    private val stdlib = root.resolve("lib/stdlib-js")
    private val home = root.resolve("home-js")

    init {
        System.setProperty("kotlin.colors.enabled", "false")
        System.setProperty("java.awt.headless", "true")
    }

    fun handle(operation: String, first: String, second: String): String = try {
        when (operation) {
            "init" -> installStandardLibrary(Base64.getDecoder().decode(first))
            "compile" -> compile(first)
            else -> error("Unknown operation '$operation'")
        }
    } catch (e: Throwable) {
        jsJson { field("error", e.stackTraceToString()) }
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
            "-libraries", stdlib.toString(),
            "-ir-output-name", "main",
        )

    private fun libraryArguments(klib: Path, sourceFile: Path) =
        commonArguments + listOf("-ir-output-dir", klib.toString(), "-nopack", sourceFile.toString())

    private fun compile(source: String): String {
        val started = System.currentTimeMillis()
        val work = root.resolve("work-js").apply { deleteRecursively() }
        val sourceFile = work.resolve("src").createDirectories().resolve(JS_FILE_NAME).apply { writeText(source) }
        val klib = work.resolve("klib")
        val output = work.resolve("js")
        val diagnostics = mutableListOf<JsDiagnostic>()

        var exitCode = runCompiler(libraryArguments(klib, sourceFile), source, diagnostics)
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

    private fun runCompiler(
        arguments: List<String>,
        source: String,
        diagnostics: MutableList<JsDiagnostic>,
    ): ExitCode {
        val lineStarts = jsLineStarts(source)
        fun offset(line: Int, column: Int): Int =
            if (line < 1 || line > lineStarts.size) 0 else (lineStarts[line - 1] + column - 1).coerceIn(0, source.length)

        val collector = object : MessageCollector {
            private var errors = false

            override fun clear() {}

            override fun hasErrors(): Boolean = errors

            override fun report(severity: CompilerMessageSeverity, message: String, location: CompilerMessageSourceLocation?) {
                if (severity.isError) errors = true
                if (!severity.isError && !severity.isWarning) return
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
