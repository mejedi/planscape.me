const IndexArrayByKey = require('./indexArrayByKey').IndexArrayByKey;
const importData = require('./importData');
const ImportPgPlanscapeData = importData.ImportPgPlanscapeData;
const ObjectTypeId = importData.ObjectTypeId;
const CreatePlanscapeGraph = require('./planscapeGraph').CreatePlanscapeGraph;

const fs = require('fs');

const data = ImportPgPlanscapeData(JSON.parse(fs.readFileSync('data.json')));
const objects = IndexArrayByKey(data.objects, 'x-id');
const graph = CreatePlanscapeGraph(objects);

// FIXME - rank assignment is manual

for (let [id, rank, bb] of [
	["0x55ec8899b520", 8, "7593,16,8089,166"],
	["0x55ec8899c850", 8, "10515,91,10975,166"],
	["0x55ec8899d478", 8, "1972,91,2190,166"],
	["0x55ec8899d9b0", 8, "1265,91,1964,166"],
	["0x55ec889a0368", 8, "11339,91,11550,166"],
	["0x55ec889a0ae8", 8, "11117,91,11331,166"],
	["0x55ec889a54b0", 7, "3178,190,3648,314"],
	["0x55ec889e3338", 7, "2406,190,3170,314"],
	["0x55ec889ef150", 7, "1984,262,2398,314"],
	["0x55ec88a46dc0", 7, "528,190,1186,314"],
	["0x55ec88a54bc0", 7, "200,190,520,314"],
	["0x55ec88a54188", 7, "1194,190,1976,314"],
	["0x55ec88b03098", 7, "16,262,192,314"],
	["0x55ec88b02e88", 6, "6991,262,7556,390"],
	["0x55ec88b06d08", 6, "7564,262,7836,390"],
	["0x55ec88c86578", 6, "6584,262,6983,390"],
	["0x55ec88c87658", 6, "5969,262,6576,390"],
	["0x55ec88c87c38", 6, "5486,262,5961,390"],
	["0x55ec88d53578", 6, "4999,262,5478,390"],
	["0x55ec88d6f198", 6, "4577,338,4991,390"],
	["0x55ec88dbc8d8", 6, "4172,338,4569,390"],
	["0x55ec88f09ae8", 6, "3672,262,4164,390"],
	["0x55ec88fa3128", 5, "10574,338,10670,466"],
	["0x55ec890e9790", 5, "10110,338,10566,466"],
	["0x55ec891322b8", 5, "9758,338,10102,466"],
	["0x55ec8917ec98", 5, "9450,414,9750,466"],
	["0x55ec891f8de8", 5, "9007,414,9442,466"],
	["0x55ec8920e058", 5, "8639,338,8999,466"],
	["0x55ec89284d98", 5, "8347,414,8631,466"],
	["0x55ec892cfa20", 5, "7860,338,8339,466"],
	["0x55ec893fcf98", 4, "11352,486,11528,538"],
	["0x55ec893fdcf0", 4, "11248,414,11344,538"],
	["0x55ec894a8218", 4, "10888,486,11240,538"],
	["0x55ec894fee08", 4, "10694,486,10880,538"],
	["0x55ec895454c8", 3, "11250,562,11442,614"],
	["0x55ec895d45a8", 2, "11040,562,11226,758"],
	["0x55ec895d5788", 1, "11148,782,11218,834"],
	["0x55ec895d5a38", 0, "11148,782,11218,834"]
]) {
    var attrs = graph.getAttrs(objects.get(id));
    attrs.rank = rank;
    attrs.bb = bb;
}

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
    while (n > 1000) {
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
                    var edge = d.edge([id, subPath['x-id']]);
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
