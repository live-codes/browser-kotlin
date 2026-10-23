package editor.compilerhost.web;

import editor.compilerhost.JsCompilerHost;
import org.graalvm.webimage.api.JS;
import org.graalvm.webimage.api.JSString;

import java.nio.file.Path;

/** Entry point of the JS-target image: same protocol as the Wasm compiler worker. */
public final class WebMainJs {
    private WebMainJs() {}

    @FunctionalInterface
    public interface Handler {
        Object handle(Object operation, Object first, Object second);
    }

    @JS.Coerce
    @JS("globalThis.kotlinCompilerHost = { call: (operation, first, second) => handler(operation, first, second) };")
    private static native void install(Handler handler);

    private static String text(Object value) {
        return value instanceof JSString string ? string.asString() : String.valueOf(value);
    }

    public static void main(String[] args) {
        JsCompilerHost host = new JsCompilerHost(Path.of("/kotlin-js"));
        install((operation, first, second) -> JSString.of(host.handle(text(operation), text(first), text(second))));
    }
}
