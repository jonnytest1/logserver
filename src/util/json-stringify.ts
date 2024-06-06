export function jsonStringify(obj) {
    return JSON.stringify(obj, (k, v) => {
        if (typeof v == "bigint") {
            return Number(v)
        }
        return v
    })
}