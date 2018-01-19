export const exists = (v) => typeof v !== 'undefined';

export const round = (x) => +(Math.round(x * 1e2)  + 'e-2');

export const extend = function () {
    let extended = {};
    for(let key in arguments) {
        let argument = arguments[key];
        for (let prop in argument) {
            if (Object.prototype.hasOwnProperty.call(argument, prop)) {
                extended[prop] = argument[prop];
            }
        }
    }

    return extended;
};