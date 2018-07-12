const IndexArrayByKey = require('./indexArrayByKey').IndexArrayByKey;
const importData = require('./importData');
const ImportPgPlanscapeData = importData.ImportPgPlanscapeData;
const ObjectTypeId = importData.ObjectTypeId;
const CreatePlanscapeGraph = require('./planscapeGraph').CreatePlanscapeGraph;

const fs = require('fs');

const data = ImportPgPlanscapeData(JSON.parse(fs.readFileSync('data.json')));
const objects = IndexArrayByKey(data.objects, 'x-id');
const graph = CreatePlanscapeGraph(objects);

const d = require('./dot').Digraph();
//d.graph({'splines': 'ortho'})
d.node({'shape': 'rectangle'});

var clusters = {};

// FIXME oversimplified, rank alone is not enough
function ClusterForRank(rank) {
    var cluster = clusters[rank];
    if (!cluster) {
        cluster = clusters[rank] = d.subgraph('cluster-'+rank);
        cluster.graph({'style':'invis'});
    }
    return cluster;
}

var pathsSeen = new Set();

function f(n) {
    if (n < 1000 || n >= 1e12 || n!=n) {
        return n.toFixed(n!=Math.round(n));
    }
    var i = -1;
    while (n >= 1000) {
        n /= 1000;
        i++;
    }
    return f(n) + 'KMG'[i];
}

function PathLabel(path) {
    var typeid = ObjectTypeId(path);
    var extra = '.';
    var label = (typeid.replace(/PATH$/,'') || typeid).toLowerCase();
    var workers = path.parallel_workers;
    if (workers) {
        extra = extra + workers;
    }
    if (path.pathkeys) {
        extra = extra + 's';
    }
    // XXX: something wrong with x-param_info, not showing when we
    // expect it to; we assume one hand of Nested Loop Join must be
    // parameterised, this doesn't hold.
    if (path['x-param_info']) {
        extra = extra + '?';
    }
    if (extra != '.') {
        label += extra;
    }
    var rows = +path.rows;
    var totalCost = +path.total_cost;
    if (rows && totalCost) {
       label += '\n'+f(rows)+'\n'+f(totalCost);
    }
    return label;
}

function RenderPath(cluster, path) {
    if (ObjectTypeId(path).endsWith('PATH') || ObjectTypeId(path) == 'X-REF') {
        if (pathsSeen.has(path)) {
            return true;
        }
        pathsSeen.add(path);
        var id = path['x-id'];
        var attrs = graph.getAttrs(path);
        var node = cluster.node(id, {
            'label': PathLabel(path)
        });
        if (attrs.isChosen) {
            node.color = 'red';
            node.fontcolor = 'red';
        };
        graph.forEachEdgeOut(path, function(subPath) {
            if (ObjectTypeId(subPath).endsWith('PATH') || ObjectTypeId(subPath) == 'X-REF') {
                var sameRel = graph.getAttrs(subPath).relOptInfo == attrs.relOptInfo;
                if (sameRel) {
                    RenderPath(cluster, subPath);
                }
                if (sameRel || attrs.isChosen) {
                    var edge = d.edge({'from':id, 'to':subPath['x-id']});
                    if (attrs.isChosen) {
                        edge.color = 'red';
                        edge.weight = 100;
                    }
                }
            }
        });
        return true;
    }
    return false;
}

function MinUserRank(path) {
    var attrs = graph.getAttrs(path);
    if (attrs.minUserRank) {
        return attrs.minUserRank;
    }
    var minUserRank = attrs.minUserRank = graph.getAttrs(attrs.relOptInfo).rank;
    graph.forEachEdgeIn(path, function(user) {
        minUserRank = Math.min(minUserRank, MinUserRank(user));
    });
    return attrs.minUserRank = minUserRank;
}

// Level-o-detail
function LODCheck(path) {
    var rank = graph.getAttrs(graph.getAttrs(path).relOptInfo).rank;
    var minUserRank = MinUserRank(path);
    var score = minUserRank == 0 ? 1000 : rank - minUserRank;
/*
    if (rank <= 2) return true;
    if (rank <= 5) return score > 0;
    if (rank <= 7) return score > 1;
*/
    return score > 2;
}

for (let [_,object] of objects) {
    if (ObjectTypeId(object) == 'RELOPTINFO') {
        
        var id = object['x-id'];
        var attrs = graph.getAttrs(object);

        var node = ClusterForRank(attrs.rank||0).subgraph('cluster-'+id);
        node.graph({
            'label': (object['x-relation-name']||'').replace(/public\./,''),
            'style': 'dotted',
            'labelloc': 'bottom',
        });

        var counter = 0;

        graph.forEachEdgeIn(object, function(path, n) {
            if (graph.getAttrs(path).isChosen || LODCheck(path)) {
                counter += +RenderPath(node,path);
            }
        });

        if (counter == 0) {
            node.node('content-'+id, {'label':'h\nM\nM','shape':'rect', 'style':'invis'})
        }
    }
}

console.log(d+'');
