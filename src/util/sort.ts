
export function sortByVal<T>(valueFnc: ((o: T) => number)) {
    const cache = new Map<T, number>()
    return function (a: T, b: T) {
        let aVal;
        if (cache.has(a)) {
            aVal = cache.get(a)
        } else {
            aVal = valueFnc(a)
            cache.set(a, aVal)
        }
        let bVal;
        if (cache.has(b)) {
            bVal = cache.get(b)
        } else {
            bVal = valueFnc(b)
            cache.set(b, bVal)
        }
        return bVal - aVal
    }
}
