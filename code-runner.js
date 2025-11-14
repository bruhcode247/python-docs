/*
 * ===================================================
 * PYTHON DOCS - CODE RUNNER JAVASCRIPT
 * ===================================================
 * Interactive Python code execution using Pyodide
 * Features: Copy code, Run Python in browser, Error handling
 * Dependencies: Pyodide CDN
 * Author: Python Docs Team
 * ===================================================
 */

// ===== GLOBAL VARIABLES =====
// Pyodide instance - holds the Python interpreter
let pyodide = null;
// Flag to track if Pyodide is fully loaded and ready
let pyodideReady = false;

// ===== PYODIDE INITIALIZATION =====
/*
 * Initialize the Pyodide Python interpreter
 * This loads the entire Python runtime into the browser
 * Only runs once per page load
 */
async function initPyodide() {
  // Exit early if already initialized
  if (pyodideReady) return;

  try {
    // Load Pyodide from CDN - this downloads ~10MB Python runtime
    pyodide = await loadPyodide();
    pyodideReady = true;
    console.log("✅ Pyodide loaded successfully");
  } catch (error) {
    console.error("❌ Failed to load Pyodide:", error);
    throw error; // Re-throw for error handling
  }
}

// ===== PAGE INITIALIZATION =====
// Start loading Pyodide as soon as the page loads
// This happens in background so it's ready when user clicks "Run"
window.addEventListener("load", () => {
  console.log("🚀 Page loaded, starting Pyodide initialization...");
  initPyodide().catch((err) => {
    console.error("Failed to initialize Pyodide on page load:", err);
  });
});

// ===== COPY FUNCTIONALITY =====
/*
 * Copy code block content to user's clipboard
 * Uses modern Clipboard API with fallback for older browsers
 * @param {HTMLElement} button - The copy button that was clicked
 */
function copyCode(button) {
  // Navigate up to find the container holding the code
  const codeContainer = button.closest(".code-container");
  // Find the actual code element within the container
  const code = codeContainer.querySelector("code");
  // Extract the text content and remove extra whitespace
  const text = code.textContent.trim();

  // Check if we have text to copy
  if (!text) {
    console.warn("No text to copy");
    return;
  }

  // Use modern Clipboard API to copy text
  navigator.clipboard
    .writeText(text)
    .then(() => {
      // Success: Update button to show feedback
      button.textContent = "Copied!";
      button.classList.add("copied"); // Triggers CSS success styling

      // Reset button after 2 seconds
      setTimeout(() => {
        button.textContent = "Copy";
        button.classList.remove("copied");
      }, 2000);
    })
    .catch((err) => {
      console.error("Failed to copy text: ", err);
      // Fallback for older browsers
      try {
        const textArea = document.createElement("textarea");
        textArea.value = text;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);

        // Show success feedback
        button.textContent = "Copied!";
        button.classList.add("copied");
        setTimeout(() => {
          button.textContent = "Copy";
          button.classList.remove("copied");
        }, 2000);
      } catch (fallbackErr) {
        console.error("Fallback copy also failed:", fallbackErr);
        button.textContent = "Copy Failed";
        setTimeout(() => {
          button.textContent = "Copy";
        }, 2000);
      }
    });
}

// ===== CODE EXECUTION FUNCTIONALITY =====
/*
 * Execute Python code in the browser using Pyodide
 * Captures output and displays it in a terminal-like interface
 * Handles errors and special cases like version commands
 * @param {HTMLElement} button - The run button that was clicked
 */
async function runCode(button) {
  // Get references to all the elements we need
  const codeContainer = button.closest(".code-container");
  const code = codeContainer.querySelector("code");
  const output = codeContainer.querySelector(".code-output");
  const codeText = code.textContent.trim();

  // ===== UI STATE MANAGEMENT =====
  // Update button to show loading state with spinner
  button.innerHTML = '<span class="loading-spinner"></span> Running';
  button.classList.add("running"); // Triggers CSS loading animation

  // Prepare output area
  output.classList.remove("error"); // Clear any previous error styling
  output.classList.add("show"); // Make output area visible

  try {
    // ===== PYODIDE READINESS CHECK =====
    // If Pyodide isn't loaded yet, initialize it now
    if (!pyodideReady) {
      output.textContent =
        "Loading Python environment (this may take a moment)...";
      await initPyodide(); // This might take a few seconds on first run
    }

    // Check if we have code to run
    if (!codeText) {
      output.textContent = "⚠️ No code to run";
      output.classList.add("error");
      return;
    }

    // ===== SPECIAL COMMAND HANDLING =====
    // Handle version commands specially since we're not in a real terminal
    if (
      codeText.includes("python --version") ||
      codeText.includes("python3 --version")
    ) {
      output.textContent =
        "Python 3.11.2 (Pyodide)\n🌐 Note: This is running in your browser with Pyodide!";
      return;
    }

    // Handle IDLE command specially
    if (codeText.includes("idle3") || codeText.includes("idle")) {
      output.textContent =
        "🖥️ IDLE cannot be launched in browser\n💡 Tip: Try running Python code directly instead!";
      return;
    }

    // ===== PYTHON CODE EXECUTION =====
    // Set up output capture - redirect Python's stdout to a string buffer
    await pyodide.runPython(`
import sys
from io import StringIO
import traceback

# Create output capture
old_stdout = sys.stdout
old_stderr = sys.stderr
stdout_buffer = StringIO()
stderr_buffer = StringIO()
sys.stdout = stdout_buffer
sys.stderr = stderr_buffer
            `);

    try {
      // Execute the user's Python code
      await pyodide.runPython(codeText);

      // Capture the output that was printed
      const stdout_result = await pyodide.runPython("stdout_buffer.getvalue()");
      const stderr_result = await pyodide.runPython("stderr_buffer.getvalue()");

      // Restore normal stdout/stderr
      await pyodide.runPython(`
sys.stdout = old_stdout
sys.stderr = old_stderr
              `);

      // Display results
      let result = "";
      if (stdout_result) result += stdout_result;
      if (stderr_result) result += (result ? "\n" : "") + "⚠️ " + stderr_result;

      output.textContent =
        result || "✅ Code executed successfully (no output)";

      // Add warning styling if there were stderr messages
      if (stderr_result) {
        output.classList.add("error");
      }
    } catch (execError) {
      // Restore stdout/stderr even if execution failed
      await pyodide.runPython(`
sys.stdout = old_stdout
sys.stderr = old_stderr
              `);
      throw execError;
    }
  } catch (error) {
    // ===== ERROR HANDLING =====
    console.error("Code execution error:", error);

    // Clean up error message for better user experience
    let errorMessage = error.message;
    if (errorMessage.includes("PythonError")) {
      // Extract just the Python error part
      const pythonErrorMatch = errorMessage.match(/PythonError: (.+)/);
      if (pythonErrorMatch) {
        errorMessage = pythonErrorMatch[1];
      }
    }

    // Display Python errors in a user-friendly way
    output.textContent = `❌ Error: ${errorMessage}`;
    output.classList.add("error"); // Triggers red error styling

    // Log full error for debugging
    console.error("Full error details:", error);
  } finally {
    // ===== CLEANUP =====
    // Always reset the button state, regardless of success or failure
    button.textContent = "Run";
    button.classList.remove("running"); // Remove loading animation
  }
}
