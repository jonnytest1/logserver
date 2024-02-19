/**
 *
 * @param {string} text
 * @param {()=>void} callback
 */
export function button(text, callback) {
    const btn = document.createElement('button');

    btn.textContent = text;
    btn.onclick = callback;
    return btn;
}