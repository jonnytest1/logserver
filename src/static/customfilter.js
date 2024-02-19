import { Filter, mapOperation } from './filters.js';
import { filterAr, setFilters } from './indexgrid.js';

/**
 * @type {HTMLInputElement}
 */
const filterInput = document.querySelector(".customfilter")
/**
 * @type {Set<string>}
 */
let columnSet = new Set()
filterInput.addEventListener("input", () => {
    const currentFilter = filterInput.value.toLowerCase().trim()
    if(currentFilter.length) {

        const filterContainer = document.querySelector(".filterselect");
        filterContainer.replaceChildren();
        [...columnSet]
            .filter(field => field.toLowerCase().startsWith(currentFilter))
            .forEach((field, i) => {
                const el = document.createElement("div")
                el.textContent = field
                el.addEventListener("click", () => {
                    filterInput.value = field
                    filterContainer.replaceChildren();
                })
                //el.style.position = "absolute"
                //el.style.top = (24 + (24 * i)) + "px"
                filterContainer.appendChild(el)
            })
    }
})
/**
 * @type {HTMLSelectElement}
 */
const operation = document.querySelector(".filtertype")
/**
 * @type {HTMLInputElement}
 */
const valueInput = document.querySelector(".valueadd")
const filterBtn = document.querySelector("#filteradd")
filterBtn.addEventListener("click", () => {

    const opSstr = mapOperation(operation.value)


    const filter = new Filter(filterInput.value, valueInput.value, opSstr)

    setFilters(filter.addTo(filterAr));
})
/**
 * 
 * @param {Set<string>} columns 
 */
export function setColumnSet(columns) {
    columnSet = columns
}


