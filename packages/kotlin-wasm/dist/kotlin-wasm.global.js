/*! @live-codes/kotlin-wasm - Apache-2.0. IIFE build, sets self.kotlinWasm.
 *  importScripts('kotlin-wasm.global.js') then self.kotlinWasm.createCompiler({ baseUrl }).
 *  The real Kotlin K2 compiler built as a GraalVM Web Image; see THIRD-PARTY-NOTICES.md. */
var kotlinWasm=(()=>{var O=Object.defineProperty;var le=Object.getOwnPropertyDescriptor;var ue=Object.getOwnPropertyNames;var ce=Object.prototype.hasOwnProperty;var fe=(e,t)=>{for(var r in t)O(e,r,{get:t[r],enumerable:!0})},me=(e,t,r,o)=>{if(t&&typeof t=="object"||typeof t=="function")for(let i of ue(t))!ce.call(e,i)&&i!==r&&O(e,i,{get:()=>t[i],enumerable:!(o=le(t,i))||o.enumerable});return e};var pe=e=>me(O({},"__esModule",{value:!0}),e);var Ye={};fe(Ye,{COMPILER_VERSION:()=>x,KotlinUnsupportedError:()=>y,KotlinWasmError:()=>g,LANGUAGE_IDS:()=>M,createCompiler:()=>Xe,createInWorkerCompiler:()=>re});var M=Object.freeze(["kotlin"]),x="2.5.0-dev-9169",K="Main.kt";function ge(e){if(e==null)return"";if(typeof e=="string")return e;if(e instanceof Uint8Array)return new TextDecoder().decode(e);if(e instanceof ArrayBuffer)return new TextDecoder().decode(new Uint8Array(e));if(ArrayBuffer.isView(e))return new TextDecoder().decode(new Uint8Array(e.buffer,e.byteOffset,e.byteLength));throw new Error("run() input must be a string, Uint8Array or ArrayBuffer.")}function de(e){if(e==null)return"wasm";if(e!=="wasm"&&e!=="js")throw new Error("target must be 'wasm' or 'js'.");return e}function H({createEngine:e}){async function t(r={}){if(typeof r=="string")throw new Error("createCompiler takes an options object; Kotlin is the only language. Call createCompiler({ baseUrl, target }).");let o=de(r.target),i=await e({...r,target:o}),n=r.fileName||K,s=!1;return{language:"kotlin",target:o,fileName:n,compilerVersion:x,capabilities:Object.freeze({language:"kotlin",compiler:x,target:o,stdin:o==="wasm",wasmGc:!0,programWasmGc:o==="wasm",analysis:!1}),async compile(u,l={}){if(s)throw new Error("This compiler has been disposed.");if(typeof u!="string")throw new Error("compile() needs the program source as its first argument.");return i.compile({code:u,fileName:l.fileName||n,compileTimeoutMs:l.timeoutMs})},async run(u,l,f={}){if(s)throw new Error("This compiler has been disposed.");if(typeof u!="string")throw new Error("run() needs the program source as its first argument.");return i.run({code:u,input:ge(l),fileName:f.fileName||n,timeoutMs:f.timeoutMs,compileTimeoutMs:f.compileTimeoutMs})},warm(){if(s)throw new Error("This compiler has been disposed.");return i.warm()},dispose(){s||(s=!0,i.dispose())}}}return{createCompiler:t,LANGUAGE_IDS:M,compilerVersion:x}}var g=class extends Error{constructor(t,r){super(t,r),this.name="KotlinWasmError"}},y=class extends g{constructor(t){super(t),this.name="KotlinUnsupportedError"}};function he(e,t,r){let i=[...(e||[]).filter(s=>s.severity==="ERROR").map(s=>s.message).join(`
`).matchAll(/unresolved reference '([\w.]+)'/gi)].map(s=>s[1]);if(!i.length)return[];let n=[];for(let s of i)for(let[u,l]of Object.entries(t)){if(r.has(u))continue;let f=l.importRoots.find(a=>a===s||a.startsWith(s+".")||a.endsWith("."+s));f&&n.push({name:u,segments:f.split(".").length})}return n.sort((s,u)=>s.segments-u.segments),[...new Set(n.map(s=>s.name))]}function we(e,t){let r=new Map;for(let[,o]of String(e).matchAll(/^\s*import\s+([\w.]+)/gm))for(let[i,n]of Object.entries(t))for(let s of n.importRoots||[])(o===s||o.startsWith(s+"."))&&r.set(i,Math.max(r.get(i)??0,s.length));return[...r.entries()].sort((o,i)=>i[1]-o[1]).map(([o])=>o)}async function N(e,{libraries:t,loaded:r,fetchArchive:o,install:i}){if(r.has(e))return;let n=t[e];if(!n)throw new Error(`Unknown Kotlin library '${e}'.`);for(let s of n.dependsOn)await N(s,{libraries:t,loaded:r,fetchArchive:o,install:i});await i(e,await o(n)),r.add(e)}async function C(e,{libraries:t,loaded:r,fetchArchive:o,install:i,source:n,attempts:s=6}){let u={libraries:t,loaded:r,fetchArchive:o,install:i};for(let f of we(n??"",t))await N(f,u);let l=await e();for(let f=0;!l.ok&&f<s;f+=1){let[a]=he(l.diagnostics,t,r);if(!a)break;await N(a,u),l=await e()}return l}function be(e,t){let r=Math.max(0,Math.min(Number(t)||0,e.length)),o=1,i=0;for(let n=0;n<r;n++)e.charCodeAt(n)===10&&(o++,i=n+1);return{line:o,column:r-i+1}}function E(e,t,r="Main.kt",o=i=>i){let i=[];for(let n of e||[]){let s=o(Number(n.from)||0),{line:u,column:l}=be(t,s),f=String(n.severity||"ERROR").toLowerCase();i.push(`${r}:${u}:${l}: ${f}: ${n.message}`)}return i}function G(e,t,r,o=i=>i){let i=E(e.diagnostics,t,r,o);return{stdout:"",stderr:"",output:"",errors:i.length?i:["Compilation failed."],exitCode:null,compileMs:Number(e.milliseconds)||0,runMs:null}}function V({chunks:e,runtimeError:t,timedOut:r,timeoutMs:o,compileMs:i,runMs:n}){let s=[],u=[],l=[],f=[];for(let p of e){let c=`${p.text??""}${p.newline?`
`:""}`;l.push(c),p.stream==="stderr"?u.push(c):s.push(c)}let a=0,m=r?`Program did not finish within ${Math.max(1,Math.round(o/1e3))} s.`:t;if(m){f.push(m);let p=m.endsWith(`
`)?m:`${m}
`;u.push(p),l.push(p),a=1}return{stdout:s.join(""),stderr:u.join(""),output:l.join(""),errors:f,exitCode:a,compileMs:Number(i)||0,runMs:typeof n=="number"?n:null}}var q=["fun currentTimeMillis(): Long = __kotlinNowMs().toLong()","fun nanoTime(): Long = (__kotlinNowMs() * 1_000_000.0).toLong()",'fun lineSeparator(): String = "\\n"',"fun getProperty(key: String): String? = null","fun getenv(name: String): String? = null","fun gc() {}",`fun arraycopy(src: Any?, srcPos: Int, dest: Any?, destPos: Int, length: Int) {
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
}`],ye=`@JsFun("() => Date.now()")
external fun __kotlinNowMs(): Double`,ve=`@JsFun("(v, d) => v.toFixed(d)")
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

fun printf(format: String, vararg args: Any?) { println(format.format(*args)) }`,Se=`@JsFun("(v) => Math.sqrt(v)")
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
}`,xe=`object Integer {
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
}`,_e=`object Character {
    fun isDigit(char: Char): Boolean = char.isDigit()
    fun isLetter(char: Char): Boolean = char.isLetter()
    fun isLetterOrDigit(char: Char): Boolean = char.isLetterOrDigit()
    fun isWhitespace(char: Char): Boolean = char.isWhitespace()
    fun isUpperCase(char: Char): Boolean = char.isUpperCase()
    fun isLowerCase(char: Char): Boolean = char.isLowerCase()
    fun toUpperCase(char: Char): Char = char.uppercaseChar()
    fun toLowerCase(char: Char): Char = char.lowercaseChar()
    fun getNumericValue(char: Char): Int = char.digitToIntOrNull() ?: -1
}`,ke=`object Arrays {
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
}`,De=`object Collections {
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
}`,Ie=`class Thread private constructor(val name: String, private val body: (() -> Unit)?) {
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

fun Throwable.printStackTrace() { println(this.toString()) }`,Te=`@JsFun("(text, isErr) => { const hook = globalThis.__kotlinWrite; if (typeof hook === 'function') { hook(text, isErr); return; } const line = text.charCodeAt(text.length - 1) === 10 ? text.slice(0, -1) : text; (isErr ? console.error : console.log)(line); }")
external fun __kotlinWrite(text: String, isErr: Boolean)

@JsFun("(code) => { const hook = globalThis.__kotlinExit; if (typeof hook === 'function') hook(code); }")
external fun __kotlinExit(code: Int)

class __KotlinPrintStream(private val isErr: Boolean) {
    fun println(message: Any?) { emit(message.toString() + "\\n") }
    fun println() { emit("\\n") }
    fun print(message: Any?) { emit(message.toString()) }
    private fun emit(text: String) { __kotlinWrite(text, isErr) }
}`,Ae=e=>new RegExp(`\\bfun\\s+(?:[\\w.]+\\.)?${e}\\s*\\(`),D=e=>new RegExp(`\\b(?:object|class|interface|annotation\\s+class)\\s+${e}\\b`);function z(e,t="wasm"){let r=[],o=D("System").test(e),i=Ae("currentTimeMillis").test(e);return i||r.push(ye),!o&&!i&&(t==="js"?r.push(q.map(n=>`fun System.${n.slice(4)}`).join(`

`)):r.push(Le())),/\bfun\s+String\.format\s*\(/.test(e)||r.push(ve),D("Math").test(e)||r.push(Se),D("Integer").test(e)||r.push(xe),D("Character").test(e)||r.push(_e),D("Arrays").test(e)||r.push(ke),D("Collections").test(e)||r.push(De),D("Thread").test(e)||r.push(Ie),r.length?`${r.join(`

`)}
`:""}function Le(){let e=q.map(t=>t.split(`
`).map(r=>`    ${r}`).join(`
`)).join(`

`);return`${Te}

object System {
    val out: __KotlinPrintStream = __KotlinPrintStream(false)
    val err: __KotlinPrintStream = __KotlinPrintStream(true)

    fun exit(status: Int) { __kotlinExit(status) }

${e}
}`}var it=Object.freeze(["System.currentTimeMillis()","System.nanoTime()","System.lineSeparator()","System.getProperty()","System.getenv()","System.gc()","System.arraycopy()","System.out / System.err (wasm)","String.format()","printf()","Math","Integer","Character","Arrays","Collections","Thread and thread()","synchronized, @Volatile, @Synchronized","Throwable.printStackTrace()"]);var P="__liveCodesKotlinWasmReadLine",Ee=`@JsFun("() => globalThis.${P}()")
external fun __liveCodesKotlinWasmStdin(): String?`;function R(e,t){return new RegExp(`\\bfun\\s+${t}\\s*\\(\\s*\\)`).test(e)}function Me(e){let t=[Ee];return R(e,"readlnOrNull")||t.push("fun readlnOrNull(): String? = __liveCodesKotlinWasmStdin()"),R(e,"readLine")||t.push("fun readLine(): String? = __liveCodesKotlinWasmStdin()"),R(e,"readln")||t.push('fun readln(): String = readlnOrNull() ?: throw NoSuchElementException("EOF")'),`${t.join(`
`)}

`}function X(e){if(!e)return[];let t=String(e).replace(/\r\n?/g,`
`),r=t.split(`
`);return t.endsWith(`
`)&&r.pop(),r}function F(e,t="",r="wasm"){let o=/\b(readln|readlnOrNull|readLine)\s*\(/.test(e),i=r==="wasm"&&(!!t||o),n=z(e,r),s=i?`
${Me(e)}`:"";return!n&&!s?{source:e,injected:!1,mapOffset:l=>l}:{source:`${e}
${n}${s}`,injected:!0,mapOffset:l=>l}}function v(e){return"data:text/javascript;charset=utf-8,"+encodeURIComponent(e)}function j(e,t){return`data:${t};base64,`+U(e)}function U(e){let t="";for(let r=0;r<e.length;r+=32768)t+=String.fromCharCode.apply(null,e.subarray(r,r+32768));return btoa(t)}var Ce=15e3,Q=18e4,$=new Map;async function Y(e){let t=await fetch(e);if(!t.ok)throw new g(`Failed to load ${e}: ${t.status} ${t.statusText}`);return new Uint8Array(await t.arrayBuffer())}async function je(e){if(!(e.length>=2&&e[0]===31&&e[1]===139))return e;let t=new Blob([e]).stream().pipeThrough(new DecompressionStream("gzip"));return new Uint8Array(await new Response(t).arrayBuffer())}function Ue(e){let t="";for(let r=0;r<e.length;r+=32768)t+=String.fromCharCode.apply(null,e.subarray(r,r+32768));return btoa(t)}function ee(){if(typeof Worker!="function"||typeof WebAssembly!="object")throw new y("Kotlin (Wasm) needs Web Workers and WebAssembly. This environment has neither.");if(typeof DecompressionStream!="function")throw new y("Kotlin (Wasm) needs DecompressionStream to inflate the compiler assets.")}function B(e){if(!e.baseUrl)throw new g("baseUrl is required in the browser. Copy the package assets somewhere your page can fetch them (`npx @live-codes/kotlin-wasm kotlin-wasm-copy-assets <dir>`) and pass that directory as baseUrl.");let t=typeof document<"u"?document.baseURI:globalThis.location?.href,r=new URL(String(e.baseUrl),t),o=r.href.endsWith("/")?r.href:`${r.href}/`;return e.target==="js"&&!o.endsWith("/js/")&&(o=new URL("js/",o).href),o}async function Oe(e){let t=async s=>{let u=new URL(s,e).href,l=await fetch(u);if(!l.ok)throw new g(`Failed to load ${u}: ${l.status} ${l.statusText}`);return l.text()},[r,o]=await Promise.all([t("kotlin-compiler-worker.js"),t("kotlin-compiler-image.js")]),i=v(W(o,e));return{wrapperUrl:v(Ne(r,e,i)),imageUrl:i}}function Ne(e,t,r){let o=new URL("kotlin-assets.json",t).href;return e.replace("new URL('./kotlin-assets.json', self.location.href)",`new URL(${JSON.stringify(o)})`).replace("importScripts('./kotlin-compiler-image.js')",`importScripts(${JSON.stringify(r)})`)}function W(e,t,r={}){let o="GraalVM.run(load_cmd_args(),config)";if(!e.includes(o))throw new g("The vendored Kotlin compiler image has an unexpected shape: its startup call was not found.");let i=r.wasmUrl||new URL("kotlin-compiler-worker.js.wasm",t).href,n=r.stdlibUrl||new URL("kotlin-stdlib-wasm-js.bin",t).href;return e.replace(o,`GraalVM.run(load_cmd_args(),Object.assign(config,{wasm_path:${JSON.stringify(i)}}))`).replace("new URL('./kotlin-stdlib-wasm-js.bin', self.location.href)",`new URL(${JSON.stringify(n)})`)}async function Re(e,t,r="wasm"){ee();let{wrapperUrl:o,imageUrl:i}=await Oe(e),n={key:e,baseUrl:e,target:r,worker:null,nextId:1,pending:new Map,progress:new Map,progressSinks:new Set(t?[t]:[]),references:0,failure:null,warmPromise:null,queue:Promise.resolve()},s=()=>{let a=0,m=0;for(let{loaded:c,total:w}of n.progress.values())a+=c,m+=w;if(!m)return;let p=Math.min(1,a/m);for(let c of n.progressSinks)c(p)},u=a=>{n.failure=a instanceof Error?a:new Error(String(a));for(let{reject:m}of n.pending.values())m(n.failure);n.pending.clear()},l=new Worker(o,{name:"kotlin-compiler"});n.worker=l,l.onmessage=({data:a})=>{if(!a||typeof a!="object")return;if(a.type==="asset-progress"){n.progress.set(a.file,{loaded:a.loaded||0,total:a.total||0}),s();return}if(a.type==="asset-error"){u(new g(a.message||"The Kotlin compiler assets failed to load."));return}let m=n.pending.get(a.id);if(!m)return;n.pending.delete(a.id);let p;try{p=JSON.parse(a.answer)}catch{m.reject(new g("The Kotlin compiler sent an invalid answer."));return}m.resolve(p)},l.onerror=a=>{u(new g(a.message||"The Kotlin compiler worker failed to start."))},l.onmessageerror=()=>{u(new g("The Kotlin compiler worker sent an unreadable message."))};let f=(a,m,p="",c=Q)=>new Promise((w,S)=>{if(n.failure){S(n.failure);return}let b=n.nextId++,I=setTimeout(()=>{n.pending.delete(b),u(new g(`The Kotlin compiler did not answer within ${Math.round(c/1e3)} s.`)),l.terminate()},c);n.pending.set(b,{resolve:d=>{clearTimeout(I),w(d)},reject:d=>{clearTimeout(I),S(d)}}),l.postMessage({id:b,operation:a,text:m,argument:p})});return n.request=f,n.loadedLibraries=new Set,n.loadLibraryIndex=async()=>n.target!=="js"?(n.libraryIndex={libraries:{}},n.libraryIndex):(n.libraryIndex??=JSON.parse(new TextDecoder().decode(await Y(new URL("libraries/kotlin-libraries.json",n.baseUrl)))),n.libraryIndex),n.fetchLibraryArchive=async a=>{let m=await Y(new URL(`libraries/${a.file}`,n.baseUrl));return je(m)},n.installLibrary=async(a,m)=>{let p=await f("addLibraries",Ue(m),a);if(p?.error)throw new g(p.error)},n.warm=()=>(n.warmPromise??=f("compile","fun main() {}").then(a=>{if(a?.error)throw new g(a.error);if(!a?.ok)throw new g("The Kotlin compiler could not compile an empty program: "+JSON.stringify(a?.diagnostics||[]));for(let m of n.progressSinks)m(1)}),n.warmPromise),n}async function Pe(e,t,r="wasm"){let o=$.get(e);if(!o)o=await Re(e,t,r),$.set(e,o);else if(t){o.progressSinks.add(t);let i=0,n=0;for(let{loaded:s,total:u}of o.progress.values())i+=s,n+=u;n&&i>=n&&t(1)}return o.references++,o}function Z(e,t){if(t&&e.progressSinks.delete(t),e.references--,!(e.references>0)){$.delete(e.key);try{e.worker.terminate()}catch{}}}function Fe(e,t){let r=new TextDecoder;return(e||[]).map(o=>{let i=Uint8Array.from(atob(o.content||""),n=>n.charCodeAt(0));return t==="js"?{name:o.name,content:r.decode(i),encoding:"utf8"}:{name:o.name,content:o.content,encoding:"base64"}})}async function te(e,{source:t,target:r,compileTimeoutMs:o}){let i=Number(o)>0?Number(o):Q;await e.loadLibraryIndex();let n=await C(async()=>{let s=await e.request("compile",t,"",i);if(s?.error)throw new g(s.error);return s},{libraries:e.libraryIndex.libraries,loaded:e.loadedLibraries,fetchArchive:e.fetchLibraryArchive,install:e.installLibrary,source:t});return{answer:n,compileMs:Number(n?.milliseconds)||0,files:n?.files||[]}}async function $e(e,{source:t,fileName:r,target:o,compileTimeoutMs:i}){let{answer:n,compileMs:s}=await te(e,{source:t,target:o,compileTimeoutMs:i});return n?.ok?{ok:!0,target:o,compilerVersion:x,fileName:r,compileMs:s,errors:[],files:Fe(n.files,o)}:{ok:!1,target:o,compilerVersion:x,fileName:r,compileMs:s,errors:E(n.diagnostics,t,r),files:[]}}async function Be(e,{source:t,timeoutMs:r,input:o,target:i}){let{answer:n,compileMs:s,files:u}=await te(e,{source:t,target:i});if(!n.ok)return{answer:n,compileMs:s,chunks:[],runMs:null};let l=[],f=i==="js"?await We(u,a=>l.push(a),r):await Je(u,a=>l.push(a),r,o);return{answer:n,compileMs:s,chunks:l,...f}}async function We(e,t,r){let o=(e||[]).find(l=>l.name==="main.mjs")||(e||[]).find(l=>/\.m?js$/.test(l.name));if(!o)throw new g("The Kotlin compiler did not emit a JavaScript module.");let i=new TextDecoder().decode(Uint8Array.from(atob(o.content||""),l=>l.charCodeAt(0))),n=v(i),s=v(`
    globalThis.write = (message) => postMessage({ output: String(message), stream: 'stdout', newline: false });
    const out = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stdout', newline: true });
    const err = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stderr', newline: true });
    console.log = out; console.info = out; console.debug = out;
    console.warn = err; console.error = err;
    try { await import(${JSON.stringify(n)}); postMessage({ done: true }); }
    catch (error) { postMessage({ done: true, error: String(error && error.stack || error) }); }
    `),u=performance.now();return new Promise(l=>{let f=new Worker(s,{type:"module",name:"kotlin-program"}),a=!1,m=c=>{a||(a=!0,clearTimeout(p),f.terminate(),l({...c,runMs:performance.now()-u}))},p=setTimeout(()=>m({timedOut:!0,timeoutMs:r}),r);f.onmessage=({data:c})=>{!c||typeof c!="object"||(c.done?m({runtimeError:c.error||null}):t({text:c.output,stream:c.stream,newline:c.newline}))},f.onerror=c=>m({runtimeError:c.message||"The Kotlin program worker failed to start."})})}async function Je(e,t,r,o=""){let i=c=>{let w=(e||[]).find(S=>S.name===c);if(!w)throw new g(`The Kotlin compiler did not emit ${c}.`);return w.content},n=c=>Uint8Array.from(atob(i(c)),w=>w.charCodeAt(0)),s=c=>new TextDecoder().decode(n(c)),u=j(n("main.wasm"),"application/wasm"),l=v(s("main.js-builtins.mjs")),f=v(s("main.import-object.mjs").replaceAll("'./main.js-builtins.mjs'",`'${l}'`)),a=v(s("main.mjs").replaceAll("'./main.import-object.mjs'",`'${f}'`).replaceAll("new URL('./main.wasm',import.meta.url).href",`'${u}'`)),m=v(`
    const inputLines = ${JSON.stringify(X(o))};
    let inputIndex = 0;
    globalThis.${P} = () => inputIndex < inputLines.length ? inputLines[inputIndex++] : null;
    globalThis.write = (message) => postMessage({ output: String(message), stream: 'stdout', newline: false });
    const out = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stdout', newline: true });
    const err = (...values) => postMessage({ output: values.map(String).join(' '), stream: 'stderr', newline: true });
    console.log = out; console.info = out; console.debug = out;
    console.warn = err; console.error = err;
    try { await import(${JSON.stringify(a)}); postMessage({ done: true }); }
    catch (error) { postMessage({ done: true, error: String(error && error.stack || error) }); }
    `),p=performance.now();return new Promise(c=>{let w=new Worker(m,{type:"module",name:"kotlin-program"}),S=!1,b=d=>{S||(S=!0,clearTimeout(I),w.terminate(),c({...d,runMs:performance.now()-p}))},I=setTimeout(()=>b({timedOut:!0,timeoutMs:r}),r);w.onmessage=({data:d})=>{!d||typeof d!="object"||(d.done?b({runtimeError:d.error||null}):t({text:d.output,stream:d.stream,newline:d.newline}))},w.onerror=d=>b({runtimeError:d.message||"The Kotlin program worker failed to start."})})}async function ne(e={}){ee();let t=e.target==="js"?"js":"wasm",r=B(e),o=await Pe(r,e.onProgress,t);if(e.warm!==!1)try{await o.warm()}catch(n){throw Z(o,e.onProgress),n}let i=!1;return{capabilities:{language:"kotlin",compiler:x,target:t,stdin:t==="wasm",wasmGc:!0,programWasmGc:t==="wasm",analysis:!1},async compile({code:n,fileName:s,compileTimeoutMs:u}){if(i)throw new Error("This compiler has been disposed.");let l=F(n,"",t);return $e(o,{source:l.source,fileName:s,target:t,compileTimeoutMs:u})},async warm(){await o.warm()},async run({code:n,input:s,fileName:u,timeoutMs:l}){if(i)throw new Error("This compiler has been disposed.");let f=Number(l)>0?Number(l):Ce,a=F(n,s,t),m=typeof a.mapOffset=="function"?a.mapOffset:c=>c-Number(a.mapOffset||0),p=await Be(o,{source:a.source,timeoutMs:f,input:s,target:t});return p.answer&&!p.answer.ok?G(p.answer,n,u,m):V({chunks:p.chunks||[],runtimeError:p.runtimeError,timedOut:p.timedOut,timeoutMs:p.timeoutMs||f,compileMs:p.compileMs,runMs:p.runMs})},dispose(){i||(i=!0,Z(o,e.onProgress))}}}var Ke="Main.kt",He=18e4,Ge=e=>e.length>=2&&e[0]===31&&e[1]===139;async function A(e){let t=await fetch(e);if(!t.ok)throw new g(`Failed to load ${e}: ${t.status} ${t.statusText}`);return new Uint8Array(await t.arrayBuffer())}var Ve="// Appended by the build to the script GraalVM generates";function qe(e){let t=e.indexOf(Ve);return t===-1?(console.warn("The Kotlin compiler image has no worker glue to strip; using it as shipped."),e):e.slice(0,t)}async function J(e){if(!Ge(e))return e;let t=new Blob([e]).stream().pipeThrough(new DecompressionStream("gzip"));return new Uint8Array(await new Response(t).arrayBuffer())}async function re(e={}){if(typeof globalThis.importScripts!="function")throw new y("createInWorkerCompiler needs a classic Web Worker. In a page or module worker, use createCompiler.");if(typeof DecompressionStream!="function")throw new y("Kotlin (Wasm) needs DecompressionStream to inflate the compiler assets.");let t=B(e),{onProgress:r}=e,o=e.target==="js"?"js":"wasm",i=globalThis.__kotlinCompilerHostTarget;if(i!==void 0&&i!==o)throw new y(`This worker already hosts the Kotlin ${i} compiler, and a GraalVM image cannot be replaced in place. Create the ${o} compiler in its own worker.`);let n=JSON.parse(new TextDecoder().decode(await A(new URL("kotlin-assets.json",t)))),s=[];for(let h of n.compiler.parts)s.push(await A(new URL(h,t)));let u=new Uint8Array(s.reduce((h,k)=>h+k.length,0)),l=0;for(let h of s)u.set(h,l),l+=h.length;let f=await J(u),a=await J(await A(new URL(n.stdlib.file,t))),m=j(f,"application/wasm"),p=new TextDecoder().decode(await A(new URL("kotlin-compiler-image.js",t))),c=W(qe(p),t,{wasmUrl:m});delete globalThis.kotlinCompilerHost,globalThis.importScripts(v(c));let w=Date.now()+He;for(;!globalThis.kotlinCompilerHost;){if(Date.now()>w)throw new g("The Kotlin compiler host did not start.");await new Promise(h=>setTimeout(h,20))}let S=JSON.parse(globalThis.kotlinCompilerHost.call("init",U(a),""));if(S.error)throw new g(S.error);globalThis.__kotlinCompilerHostTarget=o,r&&r(1);let b=null,I=new Set;async function d(){return o!=="js"?{libraries:{}}:(b??=JSON.parse(new TextDecoder().decode(await A(new URL("kotlin-libraries.json",t+"libraries/")))),b)}let oe=h=>({libraries:b?.libraries??{},loaded:I,source:h,fetchArchive:async k=>J(await A(new URL(k.file,t+"libraries/"))),install:async(k,T)=>{let L=JSON.parse(globalThis.kotlinCompilerHost.call("addLibraries",U(T),k));if(L.error)throw new g(L.error)}});return{target:o,compile:async(h,{fileName:k=Ke}={})=>{if(typeof h!="string")throw new g("compile() needs the program source as its first argument.");await d();let T=await C(async()=>{let _=JSON.parse(globalThis.kotlinCompilerHost.call("compile",h,""));if(_.error)throw new g(_.error);return _},oe(h)),L=Number(T.milliseconds)||0;if(!T.ok)return{ok:!1,compileMs:L,errors:E(T.diagnostics,h,k),files:[]};let ie=new TextDecoder;return{ok:!0,compileMs:L,errors:[],files:(T.files||[]).map(_=>{let se=Uint8Array.from(atob(_.content||""),ae=>ae.charCodeAt(0));return/\.m?js$/.test(_.name)?{name:_.name,content:ie.decode(se),encoding:"utf8"}:{name:_.name,content:_.content,encoding:"base64"}})}}}}var ze=H({createEngine:ne}),Xe=ze.createCompiler;return pe(Ye);})();
