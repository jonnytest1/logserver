/// <reference path="./logging.js"/>
import { setColumnSet } from './customfilter.js';
import { Filter } from './filters.js';
import { button } from './lib/dom-helper.js';
import { convertDuration } from './lib/duration.js';
import { GridHelper } from './lib/grid-helper.js';
import { TableHelper } from './lib/table-helper.js';
/**
* @typedef LogElement
* @property {string} application
* @property {LogLevel} severity
* @property {string} timestamp
* @property {string} message
* @property {number} index
* @property {HTMLTableElement} [__tableElement]
*/

/**
 * @typedef {{
 * value:any,
 * logEntry:LogElement,
 * key:string,
 * type?:"duration"|"date"|"string"|"link",
 * numericRepresentation?:number
 * }} ValueEntry
 */

let startIndex = 0;

async function loadMore() {
    await getLogs(false);
}

let openedIndex = null

const currentUrl = new URL(location.href);

let columnStr = currentUrl.searchParams.get('columns') || '[]';

export let filterAr = Filter.getFilterList();
/**
 * @type {Array<string>}
 */
let columns = JSON.parse(columnStr);

/**
 * @type {Record<string,Promise<Array<string>>>}
 */
let attributeData = {};

onload = () => {
    domFilters();
    /**
     * @type {HTMLButtonElement}
     */
    const loadMoreButton = document.querySelector('button#load-more-button');
    loadMoreButton.onclick = loadMore;
};

function domFilters() {
    const filterContainer = document.querySelector('#filters');
    filterContainer.replaceChildren();

    for(let filter of filterAr) {
        const filterEl = document.createElement('span');
        filterEl.textContent = filter.toJSON() + ' X';
        filterEl.onclick = () => {
            const newFilterArray = filterAr.filter(f => f !== filter);
            setFilters(newFilterArray);
        };

        filterContainer.appendChild(filterEl);
    }
}
/**
 *
 * @param {Array<Filter>} newFilters
 */
export function setFilters(newFilters) {
    Filter.updateFilterList(newFilters);
    filterAr = newFilters;
    startIndex = 0;
    domFilters();
    getLogs();
}

/**
 *
 * @param {Array<string>} newColumns
 */
function setColumns(newColumns) {

    const newUrl = new URL(location.href);
    newUrl.searchParams.set('columns', JSON.stringify(newColumns));
    history.pushState(null, document.title, newUrl.href);
    columns = newColumns;
    startIndex = 0;
    getLogs();
}

/**
 *
 * @param {string} text
 * @param {HTMLElement} element
 */
function setText(text, element) {
    let jsonParsed = false;
    try {
        const newText = JSON.parse(text);
        jsonParsed = true;
        if(typeof newText === 'string') {
            text = newText;
        }
    } catch(e) {
        //
    }

    text = `${text}`.trim();
    const textParts = text.split('\n');

    if(textParts.length > 1) {

        textParts.forEach((subText, i) => {
            const textEl = document.createElement('span');
            textEl.textContent = subText;
            element.appendChild(textEl);
            textEl.style.whiteSpace = 'nowrap';
            textEl.style.textAlign = 'center';
            if(i < textParts.length - 1) {
                const br = document.createElement('br');
                element.appendChild(br);
            } else {
                textEl.style.display = 'block';
            }
        });
    } else {
        if(jsonParsed) {
            try {
                const zeroWidthSpace = String.fromCharCode(8203);
                text = text.replace(/,{}/g, c => `${c}${zeroWidthSpace}`);
            } catch(e) {
                logKibana('ERROR', 'error replacing zerowithspcace', e);
            }
        }
        element.style.wordBreak = 'break-word';
        element.textContent = text;
    }
}


const columnSet = new Set()
async function getLogs(clearPrev = true) {

    const noDebug = location.search.includes('debug=false');
    const response = await fetch('logs.php', {
        headers: {
            'start-index': `${startIndex}`,
            'debug': `${!noDebug}`,
            'filters': `${JSON.stringify(filterAr)}`
        }
    });
    /**
     * @type {Array<LogElement>}
     */
    const values = await response.json();

    let newCount = 0;
    if(location.search.includes('count=')) {
        newCount = +location.search.split('count=')[1]
            .split('&')[0];
    }
    startIndex += values.length;
    let count = 0;
    let errorCount = 0;
    values.sort((log1, log2) => {
        const log2Millis = new Date(log2.timestamp + 'Z').valueOf();
        const log1Millis = new Date(log1.timestamp + 'Z').valueOf();
        if(log2Millis === log1Millis) {
            return log2.index - log1.index;
        }
        return log2Millis - log1Millis;
    });

    if(!columns.length) {
        setColumns(['timestamp', 'application', 'severity', 'message']);
        return;
    }
    /**
     * @type {HTMLElement}
     */
    const gridContainer = document.querySelector('#logcontainer');

    gridContainer.style.gridTemplateColumns = getGridTemplateColumns();
    if(clearPrev) {
        gridContainer.replaceChildren();
    }

    let even = true;

    let first = true

    for(const column of columns) {
        const elementContainer = document.createElement('div');
        elementContainer.className = 'grid-item';
        elementContainer.textContent = column
        elementContainer.style.borderBottom = "1px solid black"
        if(!first) {
            elementContainer.style.borderLeft = "1px solid black"
        }
        gridContainer.appendChild(elementContainer);
        first = false
    }


    for(const log of values) {
        for(const field of Object.keys(log)) {
            columnSet.add(field)
        }
        for(const column of columns) {
            if(attributeData[column] === undefined) {
                attributeData[column] = loadAttributeData(column);
            }
            const elementContainer = document.createElement('div');
            elementContainer.className = 'grid-item';
            if(even) {
                elementContainer.classList.add('even');
            }

            if(log.severity === 'ERROR' && errorCount < newCount) {
                elementContainer.classList.add('highlight-error');
            }

            const entryObject = {
                value: log[column],
                key: column,
                logEntry: log
            };
            const textElement = parseText(entryObject);
            textElement.classList.add('text-container');
            registerHover(elementContainer, entryObject);
            registerSubTable(elementContainer, log);
            elementContainer.appendChild(textElement);
            gridContainer.appendChild(elementContainer);
        }
        if(log.severity === 'ERROR') {
            errorCount++;
        }

        even = !even;
    }

    setColumnSet(columnSet);
}

/**
 *
 * @param {HTMLElement } element
 * @param {LogElement & {}} tableEntry
 */
function registerSubTable(element, tableEntry) {

    function triggerTable() {
        const selection = document.getSelection()
            .getRangeAt(0);
        if(selection.endOffset - selection.startOffset) {
            return;
        }
        if(tableEntry.__tableElement) {
            tableEntry.__tableElement.remove();
            Object.defineProperty(tableEntry, '__tableElement', {
                value: undefined
            });

        } else {
            openedIndex = tableEntry.index
            const gridWrapper = document.createElement('div');
            gridWrapper.classList.add('grid-table-item');
            const table = GridHelper.fromObject(tableEntry, {
                keyMod: (keyEl, entry) => {
                    const valEntry =/**@type {ValueEntry}*/(entry);
                    if(attributeData[valEntry.key] === undefined) {
                        attributeData[valEntry.key] = loadAttributeData(valEntry.key);
                    }
                    valEntry.logEntry = tableEntry;
                    const relContainer = document.createElement('div');
                    relContainer.classList.add('key-element');
                    relContainer.style.position = 'relative';
                    relContainer.textContent = valEntry.key;
                    keyEl.appendChild(relContainer);
                    registerHover(relContainer, valEntry);
                },
                valueMod: (valueEl, entry,) => {
                    const valEntry =/**@type {ValueEntry}*/(entry);
                    valEntry.logEntry = tableEntry;

                    const textElement = parseText(valEntry, true);
                    textElement.classList.add('value-element');
                    textElement.style.textAlign = 'center';
                    if(valEntry.key.toLowerCase().includes("stack")) {

                        textElement.style.textAlign = 'start';
                    }
                    valueEl.style.borderLeft = '1px solid black';
                    valueEl.appendChild(textElement);
                    valueEl.onclick = e => e.stopPropagation();
                }
            });
            Object.defineProperty(tableEntry, '__tableElement', {
                enumerable: false, configurable: true,
                value: gridWrapper
            });
            gridWrapper.appendChild(table);
            gridWrapper.style.gridColumn = `span ${columns.length}`;
            tableEntry.__tableElement.onclick = triggerTable;

            GridHelper.insertForNextRow(element, tableEntry.__tableElement);

        }
    }

    element.onclick = () => {
        const selection = document.getSelection()
            .getRangeAt(0);
        if(selection.endOffset - selection.startOffset) {
            return;
        }
        triggerTable();
    };


    if(openedIndex && openedIndex == tableEntry.index) {
        tableEntry.__tableElement?.remove();
        Object.defineProperty(tableEntry, '__tableElement', {
            value: undefined
        });
        triggerTable()
    }
}

/**
 *
 * @param {string} key
 * @returns {Promise<Array<string>>}
 */
async function loadAttributeData(key) {
    const response = await fetch('unique-attribute', {
        headers: {
            'unique-attr': `${key}`
        }
    });
    return response.json();
}

/**
 *
 * @param {HTMLElement} parent
 * @param {string} key
 */
async function valueList(parent, key) {
    const uniqueValues = await attributeData[key];

    const listWrapper = document.createElement('div');
    for(const value of uniqueValues) {
        const uniuqEl = document.createElement('div');
        uniuqEl.textContent = value;
        // ;

        uniuqEl.classList.add('uniqueitem');
        const eqFilter = document.createElement('div');
        eqFilter.classList.add('subelement');
        eqFilter.classList.add('eq');
        eqFilter.onclick = () => {
            setFilters(new Filter(`${key}`, value, '=').addTo(filterAr));
        };

        const eqnFilter = document.createElement('div');
        eqnFilter.classList.add('subelement');
        eqnFilter.classList.add('eqn');
        eqnFilter.onclick = () => {
            setFilters(new Filter(`${key}`, value, '!=').addTo(filterAr));
        };

        uniuqEl.appendChild(eqFilter);
        uniuqEl.appendChild(eqnFilter);
        listWrapper.appendChild(uniuqEl);
    }
    parent.replaceChildren(listWrapper);

}

/**
 *
 * @param {ValueEntry} entry
 */
function extendedChidlren(entry) {
    const children = [];
    if(entry.type === 'date' || entry.type === 'duration') {
        children.push(button('greater', () => {
            setFilters(new Filter(`${entry.key}`, entry.value, '>').addTo(filterAr));
        }));
        children.push(document.createElement('br'));
        const smallerBtn = button('smaller', () => {
            setFilters(new Filter(`${entry.key}`, entry.value, '<').addTo(filterAr));
        });
        smallerBtn.style.wordBreak = 'keep-all';
        children.push(smallerBtn);

    }
    const valueButton = button('value', () => {
        // nothing
    });
    valueButton.style.minWidth = '60px';
    valueButton.onmouseenter = () => {
        valueList(valueButton, entry.key);
    };
    children.push(valueButton);
    return children;
}
/**
 *
 * @param {HTMLElement} element
 * @param {ValueEntry} entry
 */
function registerHover(element, entry) {
    let hoverContainer = document.createElement('div');
    hoverContainer.classList.add('hover-container');
    element.addEventListener('mouseenter', (e) => {
        e.preventDefault();

        const extendedChildren = extendedChidlren(entry);

        const extendedMenu = document.createElement('div');
        if(extendedChildren.length) {
            extendedMenu.textContent = '=';
            extendedMenu.style.fontSize = '18px';
            extendedMenu.style.backgroundColor = 'white';
            extendedMenu.style.textAlign = "center"
            extendedMenu.style.width = "16px"
            let extendedMenuContainer;
            extendedMenu.onmouseenter = () => {
                extendedMenuContainer = document.createElement('div');

                extendedMenuContainer.replaceChildren(...extendedChildren);
                extendedMenuContainer.classList.add('extended-menu-container');
                hoverContainer.appendChild(extendedMenuContainer);
                // extendedMenuContainer.style.right = `-${Math.round(extendedMenuContainer.offsetWidth)}px`;
                extendedMenuContainer.style.left = `${Math.round(hoverContainer.offsetWidth)}px`;

            };
        }

        const columnEdit = document.createElement('div');
        columnEdit.textContent = columns.includes(entry.key) ? '-' : '+';
        columnEdit.style.cursor = 'pointer';
        columnEdit.style.fontSize = '18px';
        columnEdit.style.backgroundColor = 'white';
        columnEdit.style.width = "16px"
        columnEdit.style.textAlign = "center"
        columnEdit.title = columns.includes(entry.key) ? "remove column" : "add column"
        columnEdit.onclick = (clickE) => {
            clickE.stopPropagation();
            if(columnEdit.textContent === '+') {
                setColumns([...columns, entry.key]);
            } else {
                setColumns(columns.filter(col => col !== entry.key));
            }
        };

        const filterEdit = document.createElement('img');

        filterEdit.src = './assets/filter-in.png';
        filterEdit.height = 20;
        filterEdit.style.cursor = 'pointer';
        filterEdit.title = "filter in"
        filterEdit.onclick = filterE => {
            filterE.stopPropagation();
            setFilters(new Filter(`${entry.key}`, entry.value, '=').addTo(filterAr));
        };
        const filterNegative = document.createElement('img');

        filterNegative.src = './assets/filter-out.png';
        filterNegative.height = 20;
        filterNegative.style.cursor = 'pointer';
        filterNegative.title = "filter out"
        filterNegative.onclick = filterE => {
            filterE.stopPropagation();
            setFilters(new Filter(`${entry.key}`, entry.value, '!=').addTo(filterAr));
        };
        hoverContainer.replaceChildren(extendedMenu, columnEdit, filterEdit, filterNegative);
        element.appendChild(hoverContainer);
    });

    element.addEventListener('mouseleave', (e) => {
        e.preventDefault();
        hoverContainer.remove();
    });
}

/**
 * @param {ValueEntry} entry
 */
function parseText(entry, detailed = false) {
    let textElement = document.createElement('div');
    let str = `${entry.value}`;

    const columnLower = entry.key.toLowerCase();

    const timeField = columnLower.includes('time') || columnLower.includes('date') || columnLower.includes('duration');
    const urlField = columnLower.includes('url') || columnLower.includes('link');
    if(timeField) {
        str = parseTimeField(entry, detailed);
    } else if(urlField) {
        try {
            const wrapper = document.createElement('div');
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'center';
            const linkUrl = new URL(entry.value);
            const link = document.createElement('a');

            link.textContent = entry.value;
            link.href = linkUrl.href;
            link.target = '_blank';
            entry.type = 'link';
            wrapper.appendChild(link);
            return wrapper;
        } catch(e) {
            //
        }
    } else {
        entry.type = 'string';
    }

    if(str.length > 1000 && detailed) {
        textElement.textContent = '>>>> EXPAND <<<<';
        textElement.onclick = (e) => {
            console.log(str);
            e.stopPropagation();
            const selection = document.getSelection()
                .getRangeAt(0);
            if(selection.endOffset - selection.startOffset) {
                return;
            }
            if(textElement.textContent.length > 1000) {
                textElement.textContent = '>>>> EXPAND <<<<';
            } else {
                textElement.textContent = '';
                setText(str, textElement);
            }
        };
    } else {
        textElement.textContent = str;
        try {
            JSON.parse(str);
            const zeroWidthSpace = String.fromCharCode(8203);
            textElement.textContent = str.replace(/,/g, c => `${c}${zeroWidthSpace}`);
        } catch(e) {
            //
        }
    }
    return textElement;
}

/**
 *
 * @param {ValueEntry} entry
 * @param {boolean} detailed
 */
function parseTimeField(entry, detailed) {
    let str = `${entry.value}`;
    let asDate = new Date(str + 'Z');

    if(isNaN(asDate.valueOf()) && !isNaN(+str)) {
        asDate = new Date(+str);
    }
    if(isNaN(asDate.valueOf())) {
        asDate = new Date(str);
    }
    const dateValue = asDate.valueOf();
    if(!isNaN(dateValue)) {

        if(Math.abs(asDate.getFullYear() - new Date().getFullYear()) > 40) {
            entry.type = 'duration';
            entry.numericRepresentation = +str;
            str = convertDuration({
                duration: (+str),
                hours: true,
                minutes: true, types: true
            });
        } else {
            entry.type = 'date';
            entry.numericRepresentation = asDate.valueOf();
            str = asDate.toLocaleString()
                .replace(', ', '\n');
        }
        if(detailed) {
            str += ` (${entry.value})`;
        }
    }
    return str;
}

function getGridTemplateColumns() {
    return columns.map(col => {
        if(col === 'message') {
            return 'minmax(0,1fr)';
        }
        return 'minmax(80px, min-content)';
    })
        .join(' ');
}

getLogs();