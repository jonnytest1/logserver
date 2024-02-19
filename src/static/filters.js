/// <reference path="./logging.js"/>

/**
 * @typedef {"="|"!="|">"|"<"|"*="} Operation
 */

/**
 * @param {string} str
 * @returns {Operation}
 */
export function mapOperation(str) {
    switch(str) {
        case "contains":
            return "*="
        case "equals":
            return "="
        case "not equals":
            return "!="
        case "smaller":
            return "<"
        case "greater":
            return ">"
        default:
            throw new Error("wrong operation")
    }
}

export class Filter {

    /**
     *
     * @param {string} key
     * @param {string} value
     * @param {Operation} operation
     */
    constructor(key, value, operation = '=') {
        this.key = key;
        this.value = value;
        this.operation = operation;
    }

    toJSON() {
        return `${this.key}${this.operation}${this.value}`;
    }

    /**
     * @param {Array<Filter>} filterList
     */
    addTo(filterList) {
        if(this.operation === '=') {
            filterList = filterList.filter(fil => fil.key !== this.key);
        } else if(this.operation === '!=') {
            filterList = filterList.filter(fil => fil.key !== this.key || fil.operation === '!=');
        }
        filterList.push(this);
        return filterList;
    }

    /**
     *
     * @param {string} str
     */
    static fromString(str) {
        const parts = str.match(/(.+?)(!=|=|<|>)(.+)/);
        if(!parts) {
            logKibana('ERROR', { message: 'didnt match filter string', filter: str });
            throw new Error('didnt match Filter string');
        }
        let operation = /**@type {Operation}*/(parts[2]);

        return new Filter(parts[1], parts[3], operation);
    }

    static getFilterList() {
        const currentUrl = new URL(location.href);
        const filters = currentUrl.searchParams.get('filters') || '[]';
        /**
         * @type {Array<string>}
         */
        const filterStrings = JSON.parse(filters);

        return filterStrings.map(str => Filter.fromString(str));

    }

    /**
     *  @param {Array<Filter>} newFilters
     */
    static updateFilterList(newFilters) {

        const currentURl = new URL(location.href);
        currentURl.searchParams.set('filters', JSON.stringify(newFilters));
        history.pushState(null, document.title, currentURl.href);
    }

}