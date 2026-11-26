// JVM conveniences that tutorial code uses but neither Kotlin target provides.
//
// The compiler accepts extra source at compile time, so these are appended to the
// program rather than baked into the compiler image. That keeps one implementation
// for both targets, needs no image rebuild, and — because they are appended — never
// moves the line numbers diagnostics point at.
//
// Two rules make the Kotlin below safe to bolt onto arbitrary code:
//
//  - Nothing may shadow a `kotlin.*` name. `object Double` would hide
//    `kotlin.Double` and break every `Double` in the program, so `Double.parseDouble`
//    is deliberately absent: an extension cannot be added to a type the stdlib owns,
//    and a top-level `object Double` is worse than the missing function. `Math`,
//    `Integer`, `Character`, `Arrays` and `Collections` are safe because neither
//    target has types by those names.
//
//  - A shim must never call its own name unqualified. Inside `object Math`,
//    `sqrt(x)` would resolve to `Math.sqrt` and recurse forever, so the numeric
//    work goes through `@JsFun` hooks, which also avoids a dependency on
//    `kotlin.math` (not in Kotlin's default imports, and an appended file cannot
//    add an import).
//
// Every item is skipped when the program declares it, so a user can supply their
// own version.

/**
 * `js` already has `object System` (the host injects one), so its members are
 * added as extension functions. `wasm` has no `System` at all, so the object is
 * declared here. Same members either way.
 */
const SYSTEM_MEMBERS = [
  'fun currentTimeMillis(): Long = __kotlinNowMs().toLong()',
  'fun nanoTime(): Long = (__kotlinNowMs() * 1_000_000.0).toLong()',
  'fun lineSeparator(): String = "\\n"',
  'fun getProperty(key: String): String? = null',
  'fun getenv(name: String): String? = null',
  'fun gc() {}',
  `fun arraycopy(src: Any?, srcPos: Int, dest: Any?, destPos: Int, length: Int) {
    when {
        src is IntArray && dest is IntArray -> src.copyInto(dest, destPos, srcPos, srcPos + length)
        src is LongArray && dest is LongArray -> src.copyInto(dest, destPos, srcPos, srcPos + length)
        src is ShortArray && dest is ShortArray -> src.copyInto(dest, destPos, srcPos, srcPos + length)
        src is ByteArray && dest is ByteArray -> src.copyInto(dest, destPos, srcPos, srcPos + length)
        src is CharArray && dest is CharArray -> src.copyInto(dest, destPos, srcPos, srcPos + length)
        src is BooleanArray && dest is BooleanArray -> src.copyInto(dest, destPos, srcPos, srcPos + length)
        src is FloatArray && dest is FloatArray -> src.copyInto(dest, destPos, srcPos, srcPos + length)
        src is DoubleArray && dest is DoubleArray -> src.copyInto(dest, destPos, srcPos, srcPos + length)
        src is Array<*> && dest is Array<*> -> {
            if (length < 0 || srcPos < 0 || destPos < 0) throw IndexOutOfBoundsException("arraycopy")
            for (offset in 0 until length) {
                @Suppress("UNCHECKED_CAST")
                (dest as Array<Any?>)[destPos + offset] = src[srcPos + offset]
            }
        }
        else -> throw IllegalArgumentException("arraycopy: unsupported array types")
    }
}`,
];

const TIMING_HOOK = `@JsFun("() => Date.now()")
external fun __kotlinNowMs(): Double`;

const FORMAT_HELPERS = `@JsFun("(v, d) => v.toFixed(d)")
external fun __kotlinToFixed(value: Double, digits: Int): String

private fun __kotlinPad(text: String, width: Int, pad: Char, leftAlign: Boolean): String {
    if (width <= text.length) return text
    // Zero padding goes after the sign, as on the JVM: -7 with %03d is -07, not 0-7.
    if (pad == '0' && text.startsWith("-")) {
        return "-" + __kotlinPad(text.substring(1), width - 1, pad, false)
    }
    val fill = pad.toString().repeat(width - text.length)
    return if (leftAlign) text + fill else fill + text
}

private fun __kotlinFixed(value: Double, precision: Int): String {
    if (value.isNaN()) return "NaN"
    if (value.isInfinite()) return if (value > 0.0) "Infinity" else "-Infinity"
    return __kotlinToFixed(value, precision)
}

private fun __kotlinScientific(value: Double, precision: Int): String {
    if (value.isNaN()) return "NaN"
    if (value.isInfinite()) return if (value > 0.0) "Infinity" else "-Infinity"
    val negative = value < 0.0
    var magnitude = if (negative) -value else value
    var exponent = 0
    if (magnitude != 0.0) {
        while (magnitude >= 10.0) { magnitude /= 10.0; exponent++ }
        while (magnitude < 1.0) { magnitude *= 10.0; exponent-- }
    }
    val sign = if (exponent < 0) "-" else "+"
    var digits = if (exponent < 0) (-exponent).toString() else exponent.toString()
    while (digits.length < 2) digits = "0" + digits
    return (if (negative) "-" else "") + __kotlinFixed(magnitude, precision) + "e" + sign + digits
}

private fun __kotlinGrouped(number: String): String {
    val negative = number.startsWith("-")
    val body = if (negative) number.substring(1) else number
    val out = StringBuilder()
    for (index in body.indices) {
        if (index > 0 && (body.length - index) % 3 == 0) out.append(',')
        out.append(body[index])
    }
    return (if (negative) "-" else "") + out.toString()
}

fun String.format(vararg args: Any?): String {
    val out = StringBuilder()
    var index = 0
    var next = 0
    while (index < length) {
        val current = this[index]
        if (current != '%') {
            out.append(current)
            index++
            continue
        }
        if (index + 1 < length && this[index + 1] == '%') {
            out.append('%')
            index += 2
            continue
        }
        var end = index + 1
        while (end < length && !this[end].isLetter()) end++
        if (end >= length) {
            out.append(current)
            index++
            continue
        }
        val specifier = substring(index + 1, end)
        val conversion = this[end]
        index = end + 1
        if (conversion == 'n') {
            out.append('\\n')
            continue
        }
        val argument = args.getOrNull(next++)
        val flags = specifier.substringBefore('.')
        val precision = specifier.substringAfter('.', "").filter { it.isDigit() }.toIntOrNull()
        val width = flags.filter { it.isDigit() }.toIntOrNull() ?: 0
        val leftAlign = flags.contains('-')
        val zeroPad = flags.contains('0') && !leftAlign
        val grouped = flags.contains(',')
        val number = argument as? Number
        var text = when (conversion) {
            'd' -> {
                val plain = number?.toLong()?.toString() ?: argument.toString()
                if (grouped) __kotlinGrouped(plain) else plain
            }
            'f' -> __kotlinFixed(number?.toDouble() ?: 0.0, precision ?: 6)
            'e' -> __kotlinScientific(number?.toDouble() ?: 0.0, precision ?: 6)
            'x' -> number?.toLong()?.toString(16) ?: argument.toString()
            'X' -> (number?.toLong()?.toString(16) ?: argument.toString()).uppercase()
            'o' -> number?.toLong()?.toString(8) ?: argument.toString()
            'c' -> argument?.toString()?.take(1) ?: ""
            'b' -> if (argument is Boolean) argument.toString() else (argument != null).toString()
            else -> argument.toString()
        }
        val pad = if (zeroPad && (conversion == 'd' || conversion == 'f' || conversion == 'e')) '0' else ' '
        text = __kotlinPad(text, width, pad, leftAlign)
        out.append(text)
    }
    return out.toString()
}

fun printf(format: String, vararg args: Any?) { println(format.format(*args)) }`;

const MATH_HOOKS = `@JsFun("(v) => Math.sqrt(v)")
external fun __kotlinSqrt(value: Double): Double

@JsFun("(b, e) => Math.pow(b, e)")
external fun __kotlinPow(base: Double, exponent: Double): Double

@JsFun("(v) => Math.floor(v)")
external fun __kotlinFloor(value: Double): Double

@JsFun("(v) => Math.ceil(v)")
external fun __kotlinCeil(value: Double): Double

@JsFun("(v) => Math.round(v)")
external fun __kotlinRound(value: Double): Double

@JsFun("(v) => Math.sin(v)")
external fun __kotlinSin(value: Double): Double

@JsFun("(v) => Math.cos(v)")
external fun __kotlinCos(value: Double): Double

@JsFun("(v) => Math.tan(v)")
external fun __kotlinTan(value: Double): Double

@JsFun("(v) => Math.asin(v)")
external fun __kotlinAsin(value: Double): Double

@JsFun("(v) => Math.acos(v)")
external fun __kotlinAcos(value: Double): Double

@JsFun("(v) => Math.atan(v)")
external fun __kotlinAtan(value: Double): Double

@JsFun("(y, x) => Math.atan2(y, x)")
external fun __kotlinAtan2(y: Double, x: Double): Double

@JsFun("(v) => Math.log(v)")
external fun __kotlinLn(value: Double): Double

@JsFun("(v) => Math.log10(v)")
external fun __kotlinLog10(value: Double): Double

@JsFun("(v) => Math.exp(v)")
external fun __kotlinExp(value: Double): Double

@JsFun("(x, y) => Math.hypot(x, y)")
external fun __kotlinHypot(x: Double, y: Double): Double

object Math {
    const val PI: Double = 3.141592653589793
    const val E: Double = 2.718281828459045
    fun abs(value: Int): Int = if (value < 0) -value else value
    fun abs(value: Long): Long = if (value < 0L) -value else value
    fun abs(value: Float): Float = if (value < 0.0f) -value else value
    fun abs(value: Double): Double = if (value < 0.0) -value else value
    fun max(left: Int, right: Int): Int = if (left > right) left else right
    fun max(left: Long, right: Long): Long = if (left > right) left else right
    fun max(left: Float, right: Float): Float = if (left > right) left else right
    fun max(left: Double, right: Double): Double = if (left > right) left else right
    fun min(left: Int, right: Int): Int = if (left < right) left else right
    fun min(left: Long, right: Long): Long = if (left < right) left else right
    fun min(left: Float, right: Float): Float = if (left < right) left else right
    fun min(left: Double, right: Double): Double = if (left < right) left else right
    fun sqrt(value: Double): Double = __kotlinSqrt(value)
    fun cbrt(value: Double): Double = __kotlinPow(value, 1.0 / 3.0)
    fun pow(base: Double, exponent: Double): Double = __kotlinPow(base, exponent)
    fun floor(value: Double): Double = __kotlinFloor(value)
    fun ceil(value: Double): Double = __kotlinCeil(value)
    fun round(value: Float): Int = __kotlinRound(value.toDouble()).toInt()
    fun round(value: Double): Long = __kotlinRound(value).toLong()
    fun random(): Double = kotlin.random.Random.nextDouble()
    fun sin(value: Double): Double = __kotlinSin(value)
    fun cos(value: Double): Double = __kotlinCos(value)
    fun tan(value: Double): Double = __kotlinTan(value)
    fun asin(value: Double): Double = __kotlinAsin(value)
    fun acos(value: Double): Double = __kotlinAcos(value)
    fun atan(value: Double): Double = __kotlinAtan(value)
    fun atan2(y: Double, x: Double): Double = __kotlinAtan2(y, x)
    fun log(value: Double): Double = __kotlinLn(value)
    fun log10(value: Double): Double = __kotlinLog10(value)
    fun exp(value: Double): Double = __kotlinExp(value)
    fun hypot(x: Double, y: Double): Double = __kotlinHypot(x, y)
    fun signum(value: Double): Double =
        if (value > 0.0) 1.0 else if (value < 0.0) -1.0 else 0.0
    fun toRadians(degrees: Double): Double = degrees * PI / 180.0
    fun toDegrees(radians: Double): Double = radians * 180.0 / PI
}`;

const INTEGER = `object Integer {
    const val MAX_VALUE: Int = Int.MAX_VALUE
    const val MIN_VALUE: Int = Int.MIN_VALUE
    const val SIZE: Int = 32
    fun parseInt(text: String): Int = text.trim().toInt()
    fun parseInt(text: String, radix: Int): Int = text.trim().toInt(radix)
    fun parseLong(text: String): Long = text.trim().toLong()
    fun parseLong(text: String, radix: Int): Long = text.trim().toLong(radix)
    fun toString(value: Int): String = value.toString()
    fun toString(value: Int, radix: Int): String = value.toString(radix)
    fun toHexString(value: Int): String = value.toString(16)
    fun toBinaryString(value: Int): String = value.toString(2)
    fun toOctalString(value: Int): String = value.toString(8)
    fun max(left: Int, right: Int): Int = if (left > right) left else right
    fun min(left: Int, right: Int): Int = if (left < right) left else right
    fun compare(left: Int, right: Int): Int = left.compareTo(right)
    fun signum(value: Int): Int = if (value > 0) 1 else if (value < 0) -1 else 0
    fun valueOf(value: Int): Int = value
    fun sum(left: Int, right: Int): Int = left + right
}`;

const CHARACTER = `object Character {
    fun isDigit(char: Char): Boolean = char.isDigit()
    fun isLetter(char: Char): Boolean = char.isLetter()
    fun isLetterOrDigit(char: Char): Boolean = char.isLetterOrDigit()
    fun isWhitespace(char: Char): Boolean = char.isWhitespace()
    fun isUpperCase(char: Char): Boolean = char.isUpperCase()
    fun isLowerCase(char: Char): Boolean = char.isLowerCase()
    fun toUpperCase(char: Char): Char = char.uppercaseChar()
    fun toLowerCase(char: Char): Char = char.lowercaseChar()
    fun getNumericValue(char: Char): Int = char.digitToIntOrNull() ?: -1
}`;

const ARRAYS = `object Arrays {
    fun toString(values: IntArray): String = values.joinToString(", ", "[", "]")
    fun toString(values: LongArray): String = values.joinToString(", ", "[", "]")
    fun toString(values: ShortArray): String = values.joinToString(", ", "[", "]")
    fun toString(values: ByteArray): String = values.joinToString(", ", "[", "]")
    fun toString(values: CharArray): String = values.joinToString(", ", "[", "]")
    fun toString(values: BooleanArray): String = values.joinToString(", ", "[", "]")
    fun toString(values: FloatArray): String = values.joinToString(", ", "[", "]")
    fun toString(values: DoubleArray): String = values.joinToString(", ", "[", "]")
    fun toString(values: Array<*>): String = values.joinToString(", ", "[", "]")
    fun sort(values: IntArray) { values.sort() }
    fun sort(values: LongArray) { values.sort() }
    fun sort(values: DoubleArray) { values.sort() }
    fun sort(values: FloatArray) { values.sort() }
    fun equals(left: IntArray, right: IntArray): Boolean = left.contentEquals(right)
    fun equals(left: LongArray, right: LongArray): Boolean = left.contentEquals(right)
    fun equals(left: DoubleArray, right: DoubleArray): Boolean = left.contentEquals(right)
    fun copyOf(values: IntArray, newLength: Int): IntArray = values.copyOf(newLength)
    fun copyOf(values: LongArray, newLength: Int): LongArray = values.copyOf(newLength)
    fun copyOf(values: DoubleArray, newLength: Int): DoubleArray = values.copyOf(newLength)
    fun asList(vararg values: Int): List<Int> = values.toList()
}`;

const COLLECTIONS = `object Collections {
    fun <T : Comparable<T>> sort(list: MutableList<T>) { list.sort() }
    fun <T> reverse(list: MutableList<T>) { list.reverse() }
    fun <T> shuffle(list: MutableList<T>) { list.shuffle() }
    fun <T : Comparable<T>> max(collection: Collection<T>): T =
        collection.maxOrNull() ?: throw NoSuchElementException("empty collection")
    fun <T : Comparable<T>> min(collection: Collection<T>): T =
        collection.minOrNull() ?: throw NoSuchElementException("empty collection")
    fun <T> swap(list: MutableList<T>, first: Int, second: Int) {
        val held = list[first]
        list[first] = list[second]
        list[second] = held
    }
}`;

const THREADS = `class Thread private constructor(val name: String, private val body: (() -> Unit)?) {
    constructor(name: String) : this(name, null)
    constructor(body: () -> Unit) : this("Thread-" + kotlin.random.Random.nextInt(1000), body)
    fun start() { body?.invoke() }
    fun join() {}
    fun interrupt() {}
    val isAlive: Boolean get() = false
    val isDaemon: Boolean get() = false
    companion object {
        private val mainThread = Thread("main")
        fun currentThread(): Thread = mainThread
        fun sleep(millis: Long) {}
        fun sleep(millis: Long, nanos: Int) {}
    }
}

fun thread(start: Boolean = true, isDaemon: Boolean = false, body: () -> Unit): Thread =
    Thread(body).also { if (start) it.start() }

fun <R> synchronized(lock: Any, block: () -> R): R = block()

annotation class Volatile

annotation class Synchronized

fun Throwable.printStackTrace() { println(this.toString()) }`;

/**
 * On `wasm` there is no `System` to extend and no console stream, so the object is
 * declared whole: `out`/`err` route through a `@JsFun` write hook that falls back to
 * the console when the host installs none.
 *
 * The print-stream class is public on purpose: `System.out` is a public property, and
 * Kotlin rejects a public member whose type is private.
 */
const WASM_SYSTEM_HOOK = `@JsFun("(text, isErr) => { const hook = globalThis.__kotlinWrite; if (typeof hook === 'function') { hook(text, isErr); return; } const line = text.charCodeAt(text.length - 1) === 10 ? text.slice(0, -1) : text; (isErr ? console.error : console.log)(line); }")
external fun __kotlinWrite(text: String, isErr: Boolean)

@JsFun("(code) => { const hook = globalThis.__kotlinExit; if (typeof hook === 'function') hook(code); }")
external fun __kotlinExit(code: Int)

class __KotlinPrintStream(private val isErr: Boolean) {
    fun println(message: Any?) { emit(message.toString() + "\\n") }
    fun println() { emit("\\n") }
    fun print(message: Any?) { emit(message.toString()) }
    private fun emit(text: String) { __kotlinWrite(text, isErr) }
}`;

/** A top-level function, possibly an extension on a named receiver. */
const declaresFunction = (name) =>
  new RegExp(`\\bfun\\s+(?:[\\w.]+\\.)?${name}\\s*\\(`);
const declaresType = (name) =>
  new RegExp(`\\b(?:object|class|interface|annotation\\s+class)\\s+${name}\\b`);

/**
 * The compatibility shims for one program, as Kotlin source to append.
 *
 * `target` decides only how `System` is supplied: `js` extends the object its host
 * already declares (and already declares `__kotlinWrite`/`__kotlinExit`), while
 * `wasm` has no `System` and no output stream, so it is declared whole. Everything
 * else is identical, because `@JsFun` works on both.
 *
 * Every item is skipped when the program declares it, so a user can supply their
 * own version. Returns `''` when nothing is needed.
 */
export function buildCompatShims(code, target = 'wasm') {
  const parts = [];
  const hasSystem = declaresType('System').test(code);
  const hasMillis = declaresFunction('currentTimeMillis').test(code);

  // The timing hook is shared by the System members on both targets.
  if (!hasMillis) parts.push(TIMING_HOOK);

  if (!hasSystem && !hasMillis) {
    if (target === 'js') {
      // The js host declares `object System`, so a second declaration would clash;
      // extensions resolve calls that have no matching member.
      parts.push(SYSTEM_MEMBERS.map((member) => `fun System.${member.slice(4)}`).join('\n\n'));
    } else {
      parts.push(buildWasmSystem());
    }
  }

  if (!/\bfun\s+String\.format\s*\(/.test(code)) parts.push(FORMAT_HELPERS);
  if (!declaresType('Math').test(code)) parts.push(MATH_HOOKS);
  if (!declaresType('Integer').test(code)) parts.push(INTEGER);
  if (!declaresType('Character').test(code)) parts.push(CHARACTER);
  if (!declaresType('Arrays').test(code)) parts.push(ARRAYS);
  if (!declaresType('Collections').test(code)) parts.push(COLLECTIONS);
  if (!declaresType('Thread').test(code)) parts.push(THREADS);

  return parts.length ? `${parts.join('\n\n')}\n` : '';
}

/** `object System` for wasm, where no output stream exists. */
function buildWasmSystem() {
  const members = SYSTEM_MEMBERS.map((member) =>
    member
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n'),
  ).join('\n\n');

  return `${WASM_SYSTEM_HOOK}

object System {
    val out: __KotlinPrintStream = __KotlinPrintStream(false)
    val err: __KotlinPrintStream = __KotlinPrintStream(true)

    fun exit(status: Int) { __kotlinExit(status) }

${members}
}`;
}

/** Every API the shims supply, for tests and documentation. */
export const COMPAT_SHIMS = Object.freeze([
  'System.currentTimeMillis()',
  'System.nanoTime()',
  'System.lineSeparator()',
  'System.getProperty()',
  'System.getenv()',
  'System.gc()',
  'System.arraycopy()',
  'System.out / System.err (wasm)',
  'String.format()',
  'printf()',
  'Math',
  'Integer',
  'Character',
  'Arrays',
  'Collections',
  'Thread and thread()',
  'synchronized, @Volatile, @Synchronized',
  'Throwable.printStackTrace()',
]);
