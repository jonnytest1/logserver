/**
 *@param {ConvertOptions} options
 */
function getTypes(options) {

    let types = {
        sec: options.secType || 'sec',
        min: options.minType || 'min',
        hours: options.hoursType || 'hour'
    };

    if(!options.types && !options.secType && !options.minType) {
        types = {
            sec: '',
            min: '',
            hours: ''
        };
    }
    return types;
}

/**
* @param {ConvertOptions} options
*/
function initializeOptions(options) {
    if(options.separator === undefined) {
        if(options.types) {
            options.separator = ' ';
        } else {
            options.separator = ':';
        }
    }

    if(options.timestamp) {
        options.duration = Date.now() - options.timestamp;
    }

}

/**
* @param {ConvertOptions} options
*/
export function convertDuration(options) {
    initializeOptions(options);
    const types = getTypes(options);
    let seconds = Math.floor(options.duration / 1000);
    if(!isFinite(seconds)) {
        return 'Infinite';
    }
    let minutes = Math.floor(seconds / 60);

    if(options.minutes) {
        seconds -= minutes * 60;
    }
    const hours = Math.floor(minutes / 60);
    if(options.hours) {
        minutes -= hours * 60;
    }

    let parts = [];
    parts.unshift(`${seconds}${types.sec}`);
    if(options.minutes && minutes > 0) {
        parts.unshift(`${minutes}${types.min}`);
    }
    if(options.hours && hours > 0) {
        parts.unshift(`${hours}${types.hours}`);
    }
    return parts.join(options.separator);
}