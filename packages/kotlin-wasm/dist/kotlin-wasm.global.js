/*! @live-codes/kotlin-wasm - Apache-2.0. IIFE build, sets self.kotlinWasm.
 *  importScripts('kotlin-wasm.global.js') then self.kotlinWasm.createCompiler({ baseUrl }).
 *  The real Kotlin K2 compiler built as a GraalVM Web Image; see THIRD-PARTY-NOTICES.md. */
var kotlinWasm=(()=>{var U=Object.defineProperty;var se=Object.getOwnPropertyDescriptor;var ae=Object.getOwnPropertyNames;var le=Object.prototype.hasOwnProperty;var ue=(e,t)=>{for(var n in t)U(e,n,{get:t[n],enumerable:!0})},ce=(e,t,n,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of ae(t))!le.call(e,i)&&i!==n&&U(e,i,{get:()=>t[i],enumerable:!(o=se(t,i))||o.enumerable});return e};var fe=e=>ce(U({},"__esModule",{value:!0}),e);var ze={};ue(ze,{COMPILER_VERSION:()=>y,KotlinUnsupportedError:()=>v,KotlinWasmError:()=>g,LANGUAGE_IDS:()=>E,createCompiler:()=>qe,createInWorkerCompiler:()=>ne});var E=Object.freeze(["kotlin"]),y="2.5.0-dev-9169",W="Main.kt";function me(e){if(e==null)return"";if(typeof e=="string")return e;if(e instanceof Uint8Array)return new TextDecoder().decode(e);if(e instanceof ArrayBuffer)return new TextDecoder().decode(new Uint8Array(e));if(ArrayBuffer.isView(e))return new TextDecoder().decode(new Uint8Array(e.buffer,e.byteOffset,e.byteLength));throw new Error("run() input must be a string, Uint8Array or ArrayBuffer.")}function pe(e){if(e==null)return"wasm";if(e!=="wasm"&&e!=="js")throw new Error("target must be 'wasm' or 'js'.");return e}function J({createEngine:e}){async function t(n={}){if(typeof n=="string")throw new Error("createCompiler takes an options object; Kotlin is the only language. Call createCompiler({ baseUrl, target }).");let o=pe(n.target),i=await e({...n,target:o}),r=n.fileName||W,s=!1;return{language:"kotlin",target:o,fileName:r,compilerVersion:y,capabilities:Object.freeze({language:"kotlin",compiler:y,target:o,stdin:o==="wasm",wasmGc:!0,programWasmGc:o==="wasm",analysis:!1}),async compile(u,l={}){if(s)throw new Error("This compiler has been disposed.");if(typeof u!="string")throw new Error("compile() needs the program source as its first argument.");return i.compile({code:u,fileName:l.fileName||r,compileTimeoutMs:l.timeoutMs})},async run(u,l,m={}){if(s)throw new Error("This compiler has been disposed.");if(typeof u!="string")throw new Error("run() needs the program source as its first argument.");return i.run({code:u,input:me(l),fileName:m.fileName||r,timeoutMs:m.timeoutMs,compileTimeoutMs:m.compileTimeoutMs})},warm(){if(s)throw new Error("This compiler has been disposed.");return i.warm()},dispose(){s||(s=!0,i.dispose())}}}return{createCompiler:t,LANGUAGE_IDS:E,compilerVersion:y}}var g=class extends Error{constructor(t,n){super(t,n),this.name="KotlinWasmError"}},v=class extends g{constructor(t){super(t),this.name="KotlinUnsupportedError"}};function ge(e,t,n){let i=[...(e||[]).filter(s=>s.severity==="ERROR").map(s=>s.message).join(`
`).matchAll(/unresolved reference '([\w.]+)'/gi)].map(s=>s[1]);if(!i.length)return[];let r=[];for(let s of i)for(let[u,l]of Object.entries(t)){if(n.has(u))continue;let m=l.importRoots.find(a=>a===s||a.startsWith(s+".")||a.endsWith("."+s));m&&r.push({name:u,segments:m.split(".").length})}return r.sort((s,u)=>s.segments-u.segments),[...new Set(r.map(s=>s.name))]}function de(e,t){let n=new Map;for(let[,o]of String(e).matchAll(/^\s*import\s+([\w.]+)/gm))for(let[i,r]of Object.entries(t))for(let s of r.importRoots||[])(o===s||o.startsWith(s+"."))&&n.set(i,Math.max(n.get(i)??0,s.length));return[...n.entries()].sort((o,i)=>i[1]-o[1]).map(([o])=>o)}async function C(e,{libraries:t,loaded:n,fetchArchive:o,install:i}){if(n.has(e))return;let r=t[e];if(!r)throw new Error(`Unknown Kotlin library '${e}'.`);for(let s of r.dependsOn)await C(s,{libraries:t,loaded:n,fetchArchive:o,install:i});await i(e,await o(r)),n.add(e)}async function M(e,{libraries:t,loaded:n,fetchArchive:o,install:i,source:r,attempts:s=6}){let u={libraries:t,loaded:n,fetchArchive:o,install:i};for(let m of de(r??"",t))await C(m,u);let l=await e();for(let m=0;!l.ok&&m<s;m+=1){let[a]=ge(l.diagnostics,t,n);if(!a)break;await C(a,u),l=await e()}return l}function he(e,t){let n=Math.max(0,Math.min(Number(t)||0,e.length)),o=1,i=0;for(let r=0;r<n;r++)e.charCodeAt(r)===10&&(o++,i=r+1);return{line:o,column:n-i+1}}function A(e,t,n="Main.kt",o=i=>i){let i=[];for(let r of e||[]){let s=o(Number(r.from)||0),{line:u,column:l}=he(t,s),m=String(r.severity||"ERROR").toLowerCase();i.push(`${n}:${u}:${l}: ${m}: ${r.message}`)}return i}function K(e,t,n,o=i=>i){let i=A(e.diagnostics,t,n,o);return{stdout:"",stderr:"",output:"",errors:i.length?i:["Compilation failed."],exitCode:null,compileMs:Number(e.milliseconds)||0,runMs:null}}function H({chunks:e,runtimeError:t,timedOut:n,timeoutMs:o,compileMs:i,runMs:r}){let s=[],u=[],l=[],m=[];for(let c of e){let h=`${c.text??""}${c.newline?`
`:""}`;l.push(h),c.stream==="stderr"?u.push(h):s.push(h)}let a=0,f=n?`Program did not finish within ${Math.max(1,Math.round(o/1e3))} s.`:t;if(f){m.push(f);let c=f.endsWith(`
`)?f:`${f}
`;u.push(c),l.push(c),a=1}return{stdout:s.join(""),stderr:u.join(""),output:l.join(""),errors:m,exitCode:a,compileMs:Number(i)||0,runMs:typeof r=="number"?r:null}}var G=["fun currentTimeMillis(): Long = __kotlinNowMs().toLong()","fun nanoTime(): Long = (__kotlinNowMs() * 1_000_000.0).toLong()",'fun lineSeparator(): String = "\\n"',"fun getProperty(key: String): String? = null","fun getenv(name: String): String? = null","fun gc() {}",`fun arraycopy(src: Any?, srcPos: Int, dest: Any?, destPos: Int, length: Int) {
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
}`],we=`@JsFun("() => Date.now()")
external fun __kotlinNowMs(): Double`,be=`@JsFun("(v, d) => v.toFixed(d)")
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

fun printf(format: String, vararg args: Any?) { println(format.format(*args)) }`,ve=`@JsFun("(v) => Math.sqrt(v)")
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
}`,ye=`object Integer {
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
}`,xe=`object Character {
    fun isDigit(char: Char): Boolean = char.isDigit()
    fun isLetter(char: Char): Boolean = char.isLetter()
    fun isLetterOrDigit(char: Char): Boolean = char.isLetterOrDigit()
    fun isWhitespace(char: Char): Boolean = char.isWhitespace()
    fun isUpperCase(char: Char): Boolean = char.isUpperCase()
    fun isLowerCase(char: Char): Boolean = char.isLowerCase()
    fun toUpperCase(char: Char): Char = char.uppercaseChar()
    fun toLowerCase(char: Char): Char = char.lowercaseChar()
    fun getNumericValue(char: Char): Int = char.digitToIntOrNull() ?: -1
}`,Se=`object Arrays {
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
}`,_e=`object Collections {
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
}`,ke=`class Thread private constructor(val name: String, private val body: (() -> Unit)?) {
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

fun Throwable.printStackTrace() { println(this.toString()) }`,Le=`@JsFun("(text, isErr) => { const hook = globalThis.__kotlinWrite; if (typeof hook === 'function') { hook(text, isErr); return; } const line = text.charCodeAt(text.length - 1) === 10 ? text.slice(0, -1) : text; (isErr ? console.error : console.log)(line); }")
external fun __kotlinWrite(text: String, isErr: Boolean)

@JsFun("(code) => { const hook = globalThis.__kotlinExit; if (typeof hook === 'function') hook(code); }")
external fun __kotlinExit(code: Int)

class __KotlinPrintStream(private val isErr: Boolean) {
    fun println(message: Any?) { emit(message.toString() + "\\n") }
    fun println() { emit("\\n") }
    fun print(message: Any?) { emit(message.toString()) }
    private fun emit(text: String) { __kotlinWrite(text, isErr) }
}`,De=e=>new RegExp(`\\bfun\\s+(?:[\\w.]+\\.)?${e}\\s*\\(`),L=e=>new RegExp(`\\b(?:object|class|interface|annotation\\s+class)\\s+${e}\\b`);function V(e,t="wasm"){let n=[],o=L("System").test(e),i=De("currentTimeMillis").test(e);return i||n.push(we),!o&&!i&&(t==="js"?n.push(G.map(r=>`fun System.${r.slice(4)}`).join(`

`)):n.push(Ie())),/\bfun\s+String\.format\s*\(/.test(e)||n.push(be),L("Math").test(e)||n.push(ve),L("Integer").test(e)||n.push(ye),L("Character").test(e)||n.push(xe),L("Arrays").test(e)||n.push(Se),L("Collections").test(e)||n.push(_e),L("Thread").test(e)||n.push(ke),n.length?`${n.join(`

`)}
`:""}function Ie(){let e=G.map(t=>t.split(`
`).map(n=>`    ${n}`).join(`
`)).join(`

`);return`${Le}

object System {
    val out: __KotlinPrintStream = __KotlinPrintStream(false)
    val err: __KotlinPrintStream = __KotlinPrintStream(true)

    fun exit(status: Int) { __kotlinExit(status) }

${e}
}`}var rt=Object.freeze(["System.currentTimeMillis()","System.nanoTime()","System.lineSeparator()","System.getProperty()","System.getenv()","System.gc()","System.arraycopy()","System.out / System.err (wasm)","String.format()","printf()","Math","Integer","Character","Arrays","Collections","Thread and thread()","synchronized, @Volatile, @Synchronized","Throwable.printStackTrace()"]);var R="__liveCodesKotlinWasmReadLine",Te=`@JsFun("() => globalThis.${R}()")
external fun __liveCodesKotlinWasmStdin(): String?`;function O(e,t){return new RegExp(`\\bfun\\s+${t}\\s*\\(\\s*\\)`).test(e)}function Ae(e){let t=[Te];return O(e,"readlnOrNull")||t.push("fun readlnOrNull(): String? = __liveCodesKotlinWasmStdin()"),O(e,"readLine")||t.push("fun readLine(): String? = __liveCodesKotlinWasmStdin()"),O(e,"readln")||t.push('fun readln(): String = readlnOrNull() ?: throw NoSuchElementException("EOF")'),`${t.join(`
`)}

`}function q(e){if(!e)return[];let t=String(e).replace(/\r\n?/g,`
`),n=t.split(`
`);return t.endsWith(`
`)&&n.pop(),n}function N(e,t="",n="wasm"){let o=/\b(readln|readlnOrNull|readLine)\s*\(/.test(e),i=n==="wasm"&&(!!t||o),r=V(e,n),s=i?`
${Ae(e)}`:"";return!r&&!s?{source:e,injected:!1,mapOffset:l=>l}:{source:`${e}
${r}${s}`,injected:!0,mapOffset:l=>l}}var Ee=15e3,Y=18e4,P=new Map;async function z(e){let t=await fetch(e);if(!t.ok)throw new g(`Failed to load ${e}: ${t.status} ${t.statusText}`);return new Uint8Array(await t.arrayBuffer())}async function Me(e){if(!(e.length>=2&&e[0]===31&&e[1]===139))return e;let t=new Blob([e]).stream().pipeThrough(new DecompressionStream("gzip"));return new Uint8Array(await new Response(t).arrayBuffer())}function je(e){let t="";for(let n=0;n<e.length;n+=32768)t+=String.fromCharCode.apply(null,e.subarray(n,n+32768));return btoa(t)}function Z(){if(typeof Worker!="function"||typeof WebAssembly!="object")throw new v("Kotlin (Wasm) needs Web Workers and WebAssembly. This environment has neither.");if(typeof DecompressionStream!="function")throw new v("Kotlin (Wasm) needs DecompressionStream to inflate the compiler assets.")}function F(e){if(!e.baseUrl)throw new g("baseUrl is required in the browser. Copy the package assets somewhere your page can fetch them (`npx @live-codes/kotlin-wasm kotlin-wasm-copy-assets <dir>`) and pass that directory as baseUrl.");let t=typeof document<"u"?document.baseURI:globalThis.location?.href,n=new URL(String(e.baseUrl),t),o=n.href.endsWith("/")?n.href:`${n.href}/`;return e.target==="js"&&!o.endsWith("/js/")&&(o=new URL("js/",o).href),o}async function Ue(e){let t=async s=>{let u=new URL(s,e).href,l=await fetch(u);if(!l.ok)throw new g(`Failed to load ${u}: ${l.status} ${l.statusText}`);return l.text()},[n,o]=await Promise.all([t("kotlin-compiler-worker.js"),t("kotlin-compiler-image.js")]),i=URL.createObjectURL(new Blob([B(o,e)],{type:"text/javascript"}));return{wrapperUrl:URL.createObjectURL(new Blob([Ce(n,e,i)],{type:"text/javascript"})),imageUrl:i}}function Ce(e,t,n){let o=new URL("kotlin-assets.json",t).href;return e.replace("new URL('./kotlin-assets.json', self.location.href)",`new URL(${JSON.stringify(o)})`).replace("importScripts('./kotlin-compiler-image.js')",`importScripts(${JSON.stringify(n)})`)}function B(e,t,n={}){let o="GraalVM.run(load_cmd_args(),config)";if(!e.includes(o))throw new g("The vendored Kotlin compiler image has an unexpected shape: its startup call was not found.");let i=n.wasmUrl||new URL("kotlin-compiler-worker.js.wasm",t).href,r=n.stdlibUrl||new URL("kotlin-stdlib-wasm-js.bin",t).href;return e.replace(o,`GraalVM.run(load_cmd_args(),Object.assign(config,{wasm_path:${JSON.stringify(i)}}))`).replace("new URL('./kotlin-stdlib-wasm-js.bin', self.location.href)",`new URL(${JSON.stringify(r)})`)}async function Oe(e,t,n="wasm"){Z();let{wrapperUrl:o,imageUrl:i}=await Ue(e),r={key:e,baseUrl:e,target:n,worker:null,blobUrls:[o,i],nextId:1,pending:new Map,progress:new Map,progressSinks:new Set(t?[t]:[]),references:0,failure:null,warmPromise:null,queue:Promise.resolve()},s=()=>{let a=0,f=0;for(let{loaded:h,total:x}of r.progress.values())a+=h,f+=x;if(!f)return;let c=Math.min(1,a/f);for(let h of r.progressSinks)h(c)},u=a=>{r.failure=a instanceof Error?a:new Error(String(a));for(let{reject:f}of r.pending.values())f(r.failure);r.pending.clear()},l=new Worker(o,{name:"kotlin-compiler"});r.worker=l,l.onmessage=({data:a})=>{if(!a||typeof a!="object")return;if(a.type==="asset-progress"){r.progress.set(a.file,{loaded:a.loaded||0,total:a.total||0}),s();return}if(a.type==="asset-error"){u(new g(a.message||"The Kotlin compiler assets failed to load."));return}let f=r.pending.get(a.id);if(!f)return;r.pending.delete(a.id);let c;try{c=JSON.parse(a.answer)}catch{f.reject(new g("The Kotlin compiler sent an invalid answer."));return}f.resolve(c)},l.onerror=a=>{u(new g(a.message||"The Kotlin compiler worker failed to start."))},l.onmessageerror=()=>{u(new g("The Kotlin compiler worker sent an unreadable message."))};let m=(a,f,c="",h=Y)=>new Promise((x,p)=>{if(r.failure){p(r.failure);return}let w=r.nextId++,b=setTimeout(()=>{r.pending.delete(w),u(new g(`The Kotlin compiler did not answer within ${Math.round(h/1e3)} s.`)),l.terminate()},h);r.pending.set(w,{resolve:S=>{clearTimeout(b),x(S)},reject:S=>{clearTimeout(b),p(S)}}),l.postMessage({id:w,operation:a,text:f,argument:c})});return r.request=m,r.loadedLibraries=new Set,r.loadLibraryIndex=async()=>r.target!=="js"?(r.libraryIndex={libraries:{}},r.libraryIndex):(r.libraryIndex??=JSON.parse(new TextDecoder().decode(await z(new URL("libraries/kotlin-libraries.json",r.baseUrl)))),r.libraryIndex),r.fetchLibraryArchive=async a=>{let f=await z(new URL(`libraries/${a.file}`,r.baseUrl));return Me(f)},r.installLibrary=async(a,f)=>{let c=await m("addLibraries",je(f),a);if(c?.error)throw new g(c.error)},r.warm=()=>(r.warmPromise??=m("compile","fun main() {}").then(a=>{if(a?.error)throw new g(a.error);if(!a?.ok)throw new g("The Kotlin compiler could not compile an empty program: "+JSON.stringify(a?.diagnostics||[]));for(let f of r.progressSinks)f(1)}),r.warmPromise),r}async function Re(e,t,n="wasm"){let o=P.get(e);if(!o)o=await Oe(e,t,n),P.set(e,o);else if(t){o.progressSinks.add(t);let i=0,r=0;for(let{loaded:s,total:u}of o.progress.values())i+=s,r+=u;r&&i>=r&&t(1)}return o.references++,o}function X(e,t){if(t&&e.progressSinks.delete(t),e.references--,!(e.references>0)){P.delete(e.key);try{e.worker.terminate()}catch{}for(let n of e.blobUrls)URL.revokeObjectURL(n)}}function Ne(e,t){let n=new TextDecoder;return(e||[]).map(o=>{let i=Uint8Array.from(atob(o.content||""),r=>r.charCodeAt(0));return t==="js"?{name:o.name,content:n.decode(i),encoding:"utf8"}:{name:o.name,content:o.content,encoding:"base64"}})}async function Q(e,{source:t,target:n,compileTimeoutMs:o}){let i=Number(o)>0?Number(o):Y;await e.loadLibraryIndex();let r=await M(async()=>{let s=await e.request("compile",t,"",i);if(s?.error)throw new g(s.error);return s},{libraries:e.libraryIndex.libraries,loaded:e.loadedLibraries,fetchArchive:e.fetchLibraryArchive,install:e.installLibrary,source:t});return{answer:r,compileMs:Number(r?.milliseconds)||0,files:r?.files||[]}}async function Pe(e,{source:t,fileName:n,target:o,compileTimeoutMs:i}){let{answer:r,compileMs:s}=await Q(e,{source:t,target:o,compileTimeoutMs:i});return r?.ok?{ok:!0,target:o,compilerVersion:y,fileName:n,compileMs:s,errors:[],files:Ne(r.files,o)}:{ok:!1,target:o,compilerVersion:y,fileName:n,compileMs:s,errors:A(r.diagnostics,t,n),files:[]}}async function Fe(e,{source:t,timeoutMs:n,input:o,target:i}){let{answer:r,compileMs:s,files:u}=await Q(e,{source:t,target:i});if(!r.ok)return{answer:r,compileMs:s,chunks:[],runMs:null};let l=[],m=i==="js"?await Be(u,a=>l.push(a),n):await $e(u,a=>l.push(a),n,o);return{answer:r,compileMs:s,chunks:l,...m}}async function Be(e,t,n){let o=(e||[]).find(a=>a.name==="main.mjs")||(e||[]).find(a=>/\.m?js$/.test(a.name));if(!o)throw new g("The Kotlin compiler did not emit a JavaScript module.");let i=new TextDecoder().decode(Uint8Array.from(atob(o.content||""),a=>a.charCodeAt(0))),r=[],s=(a,f)=>{let c=URL.createObjectURL(new Blob([a],{type:f}));return r.push(c),c},u=s(i,"text/javascript"),l=s(`
    globalThis.write = (message) => postMessage({ output: String(message), stream: 'stdout', newline: false });
    const out = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stdout', newline: true });
    const err = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stderr', newline: true });
    console.log = out; console.info = out; console.debug = out;
    console.warn = err; console.error = err;
    try { await import(${JSON.stringify(u)}); postMessage({ done: true }); }
    catch (error) { postMessage({ done: true, error: String(error && error.stack || error) }); }
    `,"text/javascript"),m=performance.now();return new Promise(a=>{let f=new Worker(l,{type:"module",name:"kotlin-program"}),c=!1,h=p=>{if(!c){c=!0,clearTimeout(x),f.terminate();for(let w of r)URL.revokeObjectURL(w);a({...p,runMs:performance.now()-m})}},x=setTimeout(()=>h({timedOut:!0,timeoutMs:n}),n);f.onmessage=({data:p})=>{!p||typeof p!="object"||(p.done?h({runtimeError:p.error||null}):t({text:p.output,stream:p.stream,newline:p.newline}))},f.onerror=p=>h({runtimeError:p.message||"The Kotlin program worker failed to start."})})}async function $e(e,t,n,o=""){let i=p=>{let w=(e||[]).find(b=>b.name===p);if(!w)throw new g(`The Kotlin compiler did not emit ${p}.`);return w.content},r=p=>Uint8Array.from(atob(i(p)),w=>w.charCodeAt(0)),s=p=>new TextDecoder().decode(r(p)),u=[],l=(p,w)=>{let b=URL.createObjectURL(new Blob([p],{type:w}));return u.push(b),b},m=l(r("main.wasm"),"application/wasm"),a=l(s("main.js-builtins.mjs"),"text/javascript"),f=l(s("main.import-object.mjs").replaceAll("'./main.js-builtins.mjs'",`'${a}'`),"text/javascript"),c=l(s("main.mjs").replaceAll("'./main.import-object.mjs'",`'${f}'`).replaceAll("new URL('./main.wasm',import.meta.url).href",`'${m}'`),"text/javascript"),h=l(`
    const inputLines = ${JSON.stringify(q(o))};
    let inputIndex = 0;
    globalThis.${R} = () => inputIndex < inputLines.length ? inputLines[inputIndex++] : null;
    globalThis.write = (message) => postMessage({ output: String(message), stream: 'stdout', newline: false });
    const out = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stdout', newline: true });
    const err = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stderr', newline: true });
    console.log = out; console.info = out; console.debug = out;
    console.warn = err; console.error = err;
    try { await import(${JSON.stringify(c)}); postMessage({ done: true }); }
    catch (error) { postMessage({ done: true, error: String(error && error.stack || error) }); }
    `,"text/javascript"),x=performance.now();return new Promise(p=>{let w=new Worker(h,{type:"module",name:"kotlin-program"}),b=!1,S=d=>{if(!b){b=!0,clearTimeout(j),w.terminate();for(let _ of u)URL.revokeObjectURL(_);p({...d,runMs:performance.now()-x})}},j=setTimeout(()=>S({timedOut:!0,timeoutMs:n}),n);w.onmessage=({data:d})=>{!d||typeof d!="object"||(d.done?S({runtimeError:d.error||null}):t({text:d.output,stream:d.stream,newline:d.newline}))},w.onerror=d=>S({runtimeError:d.message||"The Kotlin program worker failed to start."})})}async function ee(e={}){Z();let t=e.target==="js"?"js":"wasm",n=F(e),o=await Re(n,e.onProgress,t);if(e.warm!==!1)try{await o.warm()}catch(r){throw X(o,e.onProgress),r}let i=!1;return{capabilities:{language:"kotlin",compiler:y,target:t,stdin:t==="wasm",wasmGc:!0,programWasmGc:t==="wasm",analysis:!1},async compile({code:r,fileName:s,compileTimeoutMs:u}){if(i)throw new Error("This compiler has been disposed.");let l=N(r,"",t);return Pe(o,{source:l.source,fileName:s,target:t,compileTimeoutMs:u})},async warm(){await o.warm()},async run({code:r,input:s,fileName:u,timeoutMs:l}){if(i)throw new Error("This compiler has been disposed.");let m=Number(l)>0?Number(l):Ee,a=N(r,s,t),f=typeof a.mapOffset=="function"?a.mapOffset:h=>h-Number(a.mapOffset||0),c=await Fe(o,{source:a.source,timeoutMs:m,input:s,target:t});return c.answer&&!c.answer.ok?K(c.answer,r,u,f):H({chunks:c.chunks||[],runtimeError:c.runtimeError,timedOut:c.timedOut,timeoutMs:c.timeoutMs||m,compileMs:c.compileMs,runMs:c.runMs})},dispose(){i||(i=!0,X(o,e.onProgress))}}}var We="Main.kt",Je=18e4,Ke=e=>e.length>=2&&e[0]===31&&e[1]===139;function te(e){let t="";for(let n=0;n<e.length;n+=32768)t+=String.fromCharCode.apply(null,e.subarray(n,n+32768));return btoa(t)}async function I(e){let t=await fetch(e);if(!t.ok)throw new g(`Failed to load ${e}: ${t.status} ${t.statusText}`);return new Uint8Array(await t.arrayBuffer())}var He="// Appended by the build to the script GraalVM generates";function Ge(e){let t=e.indexOf(He);return t===-1?(console.warn("The Kotlin compiler image has no worker glue to strip; using it as shipped."),e):e.slice(0,t)}async function $(e){if(!Ke(e))return e;let t=new Blob([e]).stream().pipeThrough(new DecompressionStream("gzip"));return new Uint8Array(await new Response(t).arrayBuffer())}async function ne(e={}){if(typeof globalThis.importScripts!="function")throw new v("createInWorkerCompiler needs a classic Web Worker. In a page or module worker, use createCompiler.");if(typeof DecompressionStream!="function")throw new v("Kotlin (Wasm) needs DecompressionStream to inflate the compiler assets.");let t=F(e),{onProgress:n}=e,o=e.target==="js"?"js":"wasm",i=globalThis.__kotlinCompilerHostTarget;if(i!==void 0&&i!==o)throw new v(`This worker already hosts the Kotlin ${i} compiler, and a GraalVM image cannot be replaced in place. Create the ${o} compiler in its own worker.`);let r=JSON.parse(new TextDecoder().decode(await I(new URL("kotlin-assets.json",t)))),s=[];for(let d of r.compiler.parts)s.push(await I(new URL(d,t)));let u=new Uint8Array(s.reduce((d,_)=>d+_.length,0)),l=0;for(let d of s)u.set(d,l),l+=d.length;let m=await $(u),a=await $(await I(new URL(r.stdlib.file,t))),f=URL.createObjectURL(new Blob([m],{type:"application/wasm"})),c=new TextDecoder().decode(await I(new URL("kotlin-compiler-image.js",t))),h=B(Ge(c),t,{wasmUrl:f});delete globalThis.kotlinCompilerHost,globalThis.importScripts(URL.createObjectURL(new Blob([h],{type:"text/javascript"})));let x=Date.now()+Je;for(;!globalThis.kotlinCompilerHost;){if(Date.now()>x)throw new g("The Kotlin compiler host did not start.");await new Promise(d=>setTimeout(d,20))}let p=JSON.parse(globalThis.kotlinCompilerHost.call("init",te(a),""));if(p.error)throw new g(p.error);globalThis.__kotlinCompilerHostTarget=o,n&&n(1);let w=null,b=new Set;async function S(){return o!=="js"?{libraries:{}}:(w??=JSON.parse(new TextDecoder().decode(await I(new URL("kotlin-libraries.json",t+"libraries/")))),w)}let j=d=>({libraries:w?.libraries??{},loaded:b,source:d,fetchArchive:async _=>$(await I(new URL(_.file,t+"libraries/"))),install:async(_,D)=>{let T=JSON.parse(globalThis.kotlinCompilerHost.call("addLibraries",te(D),_));if(T.error)throw new g(T.error)}});return{target:o,compile:async(d,{fileName:_=We}={})=>{if(typeof d!="string")throw new g("compile() needs the program source as its first argument.");await S();let D=await M(async()=>{let k=JSON.parse(globalThis.kotlinCompilerHost.call("compile",d,""));if(k.error)throw new g(k.error);return k},j(d)),T=Number(D.milliseconds)||0;if(!D.ok)return{ok:!1,compileMs:T,errors:A(D.diagnostics,d,_),files:[]};let re=new TextDecoder;return{ok:!0,compileMs:T,errors:[],files:(D.files||[]).map(k=>{let oe=Uint8Array.from(atob(k.content||""),ie=>ie.charCodeAt(0));return/\.m?js$/.test(k.name)?{name:k.name,content:re.decode(oe),encoding:"utf8"}:{name:k.name,content:k.content,encoding:"base64"}})}}}}var Ve=J({createEngine:ee}),qe=Ve.createCompiler;return fe(ze);})();
