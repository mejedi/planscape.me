// CreateGraph(): an object produced provides methods to declare edges
// (.connect() method) and to track node attributes (.getAttrs()).
//
// One can enumerate all edges involving the given object
// (.forEachEdgeIn(), .forEachEdgeOut()).
//
// Finally, one can propagate attributes through the graph
// (.propagateIn(), .propagateOut()).
//
module.exports.CreateGraph = function() {
    var D = new Map();

    function getDescriptor(object) {
        var descriptor = D.get(object)
        if (!descriptor) {
            descriptor = {'edgesIn': [], 'edgesOut': [], 'attrs': {}};
            D.set(object, descriptor);
        }
        return descriptor;
    }

    function connect(object1, object2) {
        var d1 = getDescriptor(object1);
        if (!d1.edgesOut.includes(object2)) {
            var d2 = getDescriptor(object2);
            d1.edgesOut.push(object2);
            d2.edgesIn.push(object1);
        }
    }

    function getAttrs(object) {
        return getDescriptor(object).attrs;
    }

    function forEachNode(fn) {
        D.forEach(function(_, object) { fn(object); });
    }

    function forEachEdgeIn(object, fn) {
        getDescriptor(object).edgesIn.forEach(fn);
    }

    function forEachEdgeOut(object, fn) {
        getDescriptor(object).edgesOut.forEach(fn);
    }

    function propagateSingleIter(dir, objects, propagateFunc) {
        var objectsNext = [];
        for (let object of objects) {
            var descriptor = getDescriptor(object);
            for (let peer of descriptor[dir]) {
                var peerDescriptor = getDescriptor(peer);
                if (propagateFunc(descriptor.attrs, peerDescriptor.attrs, object, peer))
                    objectsNext.push(peer);
            }
        }
        return objectsNext;
    }

    function propagateInSingleIter(objects, propagateFunc) {
        return propagateSingleIter('edgesIn', objects, propagateFunc);
    }

    function propagateOutSingleIter(objects, propagateFunc) {
        return propagateSingleIter('edgesOut', objects, propagateFunc);
    }

    function propagate(dir, objects, propagateFunc) {
        do {
            objects = propagateSingleIter(dir, objects, propagateFunc);
        } while (objects.length != 0);
    }

    function propagateIn(objects, propagateFunc) {
        propagate('edgesIn', objects, propagateFunc);
    }

    function propagateOut(objects, propagateFunc) {
        propagate('edgesOut', objects, propagateFunc);
    }

    return {
        'connect': connect,
        'getAttrs': getAttrs,
        'forEachNode': forEachNode,
        'forEachEdgeIn': forEachEdgeIn,
        'forEachEdgeOut': forEachEdgeOut,
        'propagateIn': propagateIn,
        'propagateOut': propagateOut,
        'propagateInSingleIter': propagateInSingleIter,
        'propagateOutSingleIter': propagateOutSingleIter
    };
}

module.exports.DefaultPropagateFunc = function (attrName) {
    return function(srcAttrs, destAttrs) {
        if (destAttrs[attrName] == undefined) {
            destAttrs[attrName] = srcAttrs[attrName];
            return true;
        }
        return false;
    }
}
