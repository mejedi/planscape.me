// Note: Map preserves order
module.exports.IndexArrayByKey = function (array, indexKey) {
    var result = new Map();
    for (item of array)
        result.set(item[indexKey], item);
    return result;
}
