export class GridHelper {

    /**
     *
     * @param {HTMLElement} currentElement
     * @param {number} columnCount
     */
    static getNextRowIndex(currentElement, columnCount) {
        const container = currentElement.parentElement;
        let currentIndex = [...container.children].indexOf(currentElement);
        let gridIndex = 0;
        for(let i = 0; i < currentIndex; i++) {
            /**
             * @type {any}
             */
            const elementAtIndex = container.children[i];
            const gridColumn = elementAtIndex.style.gridColumn;
            if(gridColumn && gridColumn.includes('span')) {
                gridIndex += +gridColumn.split('span ')[1]
                    .split(' ')[0];
            } else {
                gridIndex++;
            }
        }
        const gridIndexOffset = ((columnCount - (gridIndex % columnCount)) % columnCount);

        return currentIndex + gridIndexOffset;
    }
    /**
     *
     * @param {HTMLElement} currentElement
     * @param {Node} insertingNode
     */
    static insertForNextRow(currentElement, insertingNode) {
        const parent = currentElement.parentElement;
        const gridColumnLength = getComputedStyle(parent).gridTemplateColumns
            .split(' ').length;
        const nextRowStartIndex = GridHelper.getNextRowIndex(currentElement, gridColumnLength);
        parent.insertBefore(insertingNode, parent.children[nextRowStartIndex]);
    }

    /**
     * @param {any} tableObject
     * @param {{keyMod?:(k:HTMLElement,entry:{key:string,value:string})=>void,valueMod?:(k:HTMLElement,entry:{key:string,value:string})=>void}} [opts]
     */
    static fromObject(tableObject, opts = {}) {
        const grid = document.createElement('div');
        grid.classList.add('grid-container');
        Object.entries(tableObject)
            .forEach(([key, value]) => {
                const obj = {
                    key, value
                };
                const keyEl = document.createElement('div');
                keyEl.classList.add('grid-item');
                keyEl.classList.add('key');
                keyEl.style.padding = '2px';
                if(opts.keyMod) {
                    opts.keyMod(keyEl, obj);
                }
                grid.appendChild(keyEl);

                const valueEl = document.createElement('div');
                valueEl.classList.add('grid-item');
                valueEl.classList.add('value');
                if(opts.valueMod) {
                    opts.valueMod(valueEl, obj);
                }
                grid.appendChild(valueEl);
            });
        return grid;
    }
}