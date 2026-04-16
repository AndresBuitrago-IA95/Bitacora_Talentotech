declare global {
  interface Window {
    loadPyodide: any;
  }
}

let pyodideInstance: any = null;

export async function getPyodide() {
  if (pyodideInstance) return pyodideInstance;

  if (typeof window.loadPyodide === 'undefined') {
    throw new Error('Pyodide script not loaded');
  }

  pyodideInstance = await window.loadPyodide({
    indexURL: "https://cdn.jsdelivr.net/pyodide/v0.25.0/full/",
  });
  
  return pyodideInstance;
}

export async function runPythonCode(code: string): Promise<{ output: string; error?: string }> {
  try {
    const pyodide = await getPyodide();
    
    // Redirect stdout to a variable
    pyodide.runPython(`
import sys
import io
sys.stdout = io.StringIO()
    `);
    
    await pyodide.runPythonAsync(code);
    
    const stdout = pyodide.runPython("sys.stdout.getvalue()");
    return { output: stdout };
  } catch (err: any) {
    console.error("Python Execution Error:", err);
    return { output: "", error: err.message };
  }
}
