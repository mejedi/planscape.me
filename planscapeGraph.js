const graph = require('./graph');
const CreateGraph = graph.CreateGraph;
const DefaultPropagateFunc = graph.DefaultPropagateFunc;
const ObjectTypeId = require('./importData').ObjectTypeId;
const Digraph = require('./dot').Digraph;
const ExecSync = require('child_process').execSync;

// Assign ranks using graphviz
function Rank(graph, objectsIndex) {

    var rendering = Digraph();
    rendering.graph({'phase': 1});

    for (let [id, object] of objectsIndex) {
        if (ObjectTypeId(object) == 'RELOPTINFO') {
            graph.forEachEdgeOut(object, function(peer) {
                if (ObjectTypeId(peer) == 'RELOPTINFO') {
                    rendering.edge({'from': id, 'to': peer['x-id']});
                }
            });
        }
    }

    var output = JSON.parse(ExecSync('/usr/local/bin/dot -Tdot_json', {
        'input': rendering.toString(),
        'encoding': 'utf8'
    }));

    for (let object of output.objects) {
        graph.getAttrs(objectsIndex.get(object.name)).rank = +object.rank;
    }
}

module.exports.CreatePlanscapeGraph = function (objectsIndex) {
    var graph = CreateGraph();

    function extractEdges(root, subObject) {
        var target = objectsIndex.get(subObject['X-REF']);
        if (target) {
            var targetTypeId = ObjectTypeId(target);
            if (targetTypeId == 'X-REF' || targetTypeId == 'RELOPTINFO'
                || targetTypeId.endsWith('PATH'))
            {
                graph.connect(root, target);
            }
        }
        // X-REF may have x-parent
        for (key in subObject) {
            var nested = subObject[key];
            if (nested instanceof Object)
                extractEdges(root, nested);
        }
    }

    var chosenObjects = [];
    var plannerInfos = [];
    var relOptInfos = [];

    for (let [_,object] of objectsIndex) {

        if (object['x-is-chosen']) {
            chosenObjects.push(object);
            graph.getAttrs(object).isChosen = true;
        }

        var typeid = ObjectTypeId(object);

        if (typeid == 'PLANNERINFO') {
            plannerInfos.push(object);
            graph.getAttrs(object).plannerInfo = object;
        } else if (typeid == 'RELOPTINFO') {
            relOptInfos.push(object);
            graph.getAttrs(object).relOptInfo = object;
            extractEdges(object, object);
        } else if (typeid == 'X-REF' || typeid.endsWith('PATH')) {
            extractEdges(object, object);
        }
    }

    graph.propagateOut(chosenObjects, DefaultPropagateFunc('isChosen'));

    graph.propagateIn(plannerInfos, DefaultPropagateFunc('plannerInfo'));

    var toplevelPaths = graph.propagateInSingleIter(relOptInfos,
                                                    DefaultPropagateFunc('relOptInfo'));

    // Some RelOptInfo-s aren't connected to a PlannerInfo. However,
    // their toplevel paths already have @plannerInfo set (from
    // sub-paths). Do one propagate iteration in 'out' direction so that
    // these RelOptInfo-s are properly tagged.
    graph.propagateOutSingleIter(toplevelPaths, DefaultPropagateFunc('plannerInfo'));

    // Tag objects with @relOptInfo - that is, the RelOptInfo a path
    // belongs to. Also detect connections between RelOptInfos, based on
    // member paths topology.
    graph.propagateOut(toplevelPaths, function (srcAttrs, destAttrs) {
        var srcRelOptInfo = srcAttrs.relOptInfo;
        var destRelOptInfo = destAttrs.relOptInfo;

        if (!destRelOptInfo) {
            destAttrs.relOptInfo = srcRelOptInfo;
            return true;
        }

        if (destRelOptInfo != srcRelOptInfo) {
            graph.connect(srcRelOptInfo, destRelOptInfo);
            if (srcAttrs.isChosen) {
                var srcRelOptInfoAttrs = graph.getAttrs(srcRelOptInfo);
                var childRelOptInfosViaChosen = srcRelOptInfoAttrs.childRelOptInfosViaChosen;
                if (!childRelOptInfosViaChosen) {
                    childRelOptInfosViaChosen = 
                    srcRelOptInfoAttrs.childRelOptInfosViaChosen = new Set();
                }
                childRelOptInfosViaChosen.add(destRelOptInfo);
            }
        }

        return false;
    });

    Rank(graph, objectsIndex);
    return graph;
}
