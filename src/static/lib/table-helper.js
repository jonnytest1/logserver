export class TableHelper {

    /**
     * @param {any} tableObject
     * @param {{keyMod?:(k:HTMLTableCellElement,key:string,value:string)=>void,valueMod?:(k:HTMLTableCellElement,key:string,value:string)=>void}} [opts]
     */
    static createTable(tableObject, opts = {}) {
        const table = document.createElement('table');

        Object.entries(tableObject)
            .forEach(([key, value]) => {
                const row = document.createElement('tr');

                const keyEl = document.createElement('td');
                if(opts.keyMod) {
                    opts.keyMod(keyEl, key, value);
                }
                row.appendChild(keyEl);

                const valueEl = document.createElement('td');
                if(opts.valueMod) {
                    opts.valueMod(valueEl, key, value);
                }
                row.appendChild(valueEl);

                table.appendChild(row);
            });
        return table;
    }
}