const gvKeywords = ['node', 'edge', 'graph', 'digraph', 'subgraph', 'strict'];

function GvEscape(id) {
    id = '' + id;
    if (id.match(/^(?:[_a-z][_a-z0-9]*|-?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?))$/i) &&
        !gvKeywords.includes(id.toLowerCase()))
        return id;
    return `"${(''+id).replace('"','\\"')}"`;
}

function GvFormatAttrs(attrs) {
    var attrList = [];
    for (key in attrs) {
        attrList.push(`${GvEscape(key)}=${GvEscape(attrs[key])}`);
    }
    return attrList.length == 0 ? '' : `[${attrList.join(',')}]`;
}

function GraphLike(options) {

    var edgeType = options.edgeType;

    var out = [];

    function genericAttr(id, attrs) {
        var instance = Object.assign(attrs||{}, {});
        out.push(function() {
            return `${id}${GvFormatAttrs(instance)}`;
        });
        return instance;
    }

    this.graph = function(attrs) {
        return genericAttr('graph', attrs);
    }

    this.node = function(id, attrs) {
        if (id instanceof Object && !attrs) {
            attrs = id;
            id = 'node';
        } else {
            id = GvEscape(id);
        }
        return genericAttr(id, attrs);
    }

    this.edge = function(id, attrs) {
        if (!(id instanceof Array) && !attrs) {
            attrs = id;
            id = 'edge';
        } else {
            id = `${GvEscape(id[0])}${edgeType}${GvEscape(id[1])}`;
        }
        return genericAttr(id, attrs);
    }

    this.subgraph = function(id) {
        var subgraph = new GraphLike({
            'id': id, 'entityType': 'subgraph', 'edgeType': edgeType});
        out.push(function() {return ''+subgraph;} );
        return subgraph;
    }

    this.toString = function() {
        var stmtList = out.map(fn=>fn());
        var quals = [];
        if (options.strict)
            quals.push('strict');
        quals.push(options.entityType);
        var id = options.id;
        if (id != undefined)
            quals.push(GvEscape(id));
        return `${quals.join(' ')} {${stmtList.join(';')}}`;
    }
}

module.exports.Graph = function (options) {
    options = Object.assign(options||{}, {});
    options.entityType = 'graph';
    options.edgeType = '--';
    return new GraphLike(options);
}

module.exports.Digraph = function (options) {
    options = Object.assign(options||{}, {});
    options.entityType = 'digraph';
    options.edgeType = '->';
    return new GraphLike(options);
}
