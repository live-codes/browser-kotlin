// The result shape every host gets, and the conversions from compiler
// diagnostics (character offsets) to the `file:line:column` lines hosts show.

export function offsetToLineCol(source, offset) {
  const end = Math.max(0, Math.min(Number(offset) || 0, source.length));
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < end; i++) {
    if (source.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: end - lineStart + 1 };
}

export function formatDiagnostics(diagnostics, source, fileName = 'Main.kt') {
  const lines = [];
  for (const diagnostic of diagnostics || []) {
    const { line, column } = offsetToLineCol(source, diagnostic.from);
    const severity = String(diagnostic.severity || 'ERROR').toLowerCase();
    lines.push(`${fileName}:${line}:${column}: ${severity}: ${diagnostic.message}`);
  }
  return lines;
}

export function compileFailureResult(answer, source, fileName) {
  const errors = formatDiagnostics(answer.diagnostics, source, fileName);
  return {
    stdout: '',
    stderr: '',
    output: '',
    errors: errors.length ? errors : ['Compilation failed.'],
    exitCode: null,
    compileMs: Number(answer.milliseconds) || 0,
    runMs: null
  };
}

export function buildResult({ chunks, runtimeError, timedOut, timeoutMs, compileMs, runMs }) {
  const stdout = [];
  const stderr = [];
  const output = [];
  const errors = [];

  for (const chunk of chunks) {
    const text = `${chunk.text ?? ''}${chunk.newline ? '\n' : ''}`;
    output.push(text);
    if (chunk.stream === 'stderr') stderr.push(text);
    else stdout.push(text);
  }

  let exitCode = 0;
  const failure = timedOut
    ? `Program did not finish within ${Math.max(1, Math.round(timeoutMs / 1000))} s.`
    : runtimeError;

  if (failure) {
    errors.push(failure);
    const line = failure.endsWith('\n') ? failure : `${failure}\n`;
    stderr.push(line);
    output.push(line);
    exitCode = 1;
  }

  return {
    stdout: stdout.join(''),
    stderr: stderr.join(''),
    output: output.join(''),
    errors,
    exitCode,
    compileMs: Number(compileMs) || 0,
    runMs: typeof runMs === 'number' ? runMs : null
  };
}
