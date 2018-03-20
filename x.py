from pg_nodetostring import parse_nodetostring_data
from ps_augmentor import PlanscapeAugmentor
import json
import base64
import re
from humanize import intcomma
from graphviz import Digraph

with open('data.json') as f:
  planscape_json = json.loads(f.read())

def convert_planscape_json(ps_json):
  augmentor = PlanscapeAugmentor(ps_json)
  relmap = dict((rel['oid'], rel) for rel in ps_json['relations'])
  raw_samples = ps_json['samples']
  parsed_samples = (parse_nodetostring_data(obj['data'], augmentor)
                    for obj in raw_samples)
  samples = list({**a, **b} for a, b in zip(raw_samples, parsed_samples))

  components = connected_components(samples)

  # remove EXPLAIN... from the query string
  query = ps_json['query']
  m = re.match(r'\s*EXPLAIN\s+\([^)]*\)\s+(.*)', query, re.IGNORECASE)
  if m:
    query = m.group(1)

  return dict(query = query,
              modules = ps_json['modules'],
              roots = list((convert_component(component, relmap)
                            for component in components)))

def connected_components(objects):
  def unwrap(x):
    return unwrap(x['next']) if 'next' in x else x
  g, l = {}, []
  for obj in objects:
    n1 = obj['id']
    el = []
    l.append(el)
    x1 = unwrap(g.setdefault(n1, {'': el}))
    links = obj['links'][:]
    if 'parent' in obj:
      links.append(obj['parent'])
    for n2 in links:
      x2 = unwrap(g.setdefault(n2, x1))
      if id(x1) != id(x2):
        x2['next'] = x1
  for obj in objects:
    unwrap(g[obj['id']])[''].append(obj)
  return [i for i in l if i]

def typename(obj):
  return next(iter(sorted(obj.keys())), None)

def convert_component(component, relmap):
  relidmap, children = {}, {}

  # build relidmap and children index
  for obj in component:
    rel = relmap.get(obj.get('oid', None), None)
    if rel:
      relidmap[obj['data'].get('relid', None)] = rel
      obj['data']['relname'] = rel['name']
    children.setdefault(obj.get('parent', None), []).append(obj)

  # resolve VARs
  for obj in component:
    for var in obj['variables']:
      varno, varattno = var['varno'], var['varattno']
      rel = relidmap.get(varno, None)
      if rel and varattno <= len(rel['attrs']):
        var['VAR'] = '{}.{}'.format(
          rel['name'], '*' if varattno == 0 else rel['attrs'][varattno - 1])
  
  # extract PLANNERINFO
  pinfo = next((obj['data'] for obj in component
               if typename(obj['data']) == 'PLANNERINFO'), None)

  return dict(data = pinfo,
              rels = [convert_rel(obj, children[obj['id']])
                      for obj in component
                      if typename(obj['data']) == 'RELOPTINFO'])

def convert_rel(rel, paths):
  paths = [dict(id = path['id'],
            data = path['data'],
            backtrace = path['backtrace'],
            isChosen = path.get('isChosen', False))
        for path in paths]
        
  #paths.sort(key = lambda path: path.get('data', {}).get('total_cost', 0))

  return dict(id = rel['id'],
              data = rel['data'],
              paths = paths)

class MyEncoder(json.JSONEncoder):
  def default(self, o):
    if isinstance(o, bytes):
      return base64.b64encode(o).decode('ascii')
    return json.JSONEncoder.default(self, o)



data = convert_planscape_json(planscape_json)

def path_extra(path):
  return '{}{}{}'.format(
    'P' if path.get('x-param_info', None) else '',
    'S' if path.get('pathkeys', None) else '',
    path.get('parallel_workers', 0) or '')

def make_node_label(lines, extra = None):
  return ('<<TABLE BORDER="0" CELLBORDER="1" CELLSPACING="0"><TR>'
          '<TD>{}</TD>{}</TR></TABLE>>').format(
              '<BR/>'.join((str(line) for line in lines)),
              '<TD>{}</TD>'.format(extra) if extra else '')


def subpaths(path):
  subpath = path.get('X-REF', None)
  if subpath:
    yield subpath
  for key in ('subpath', 'innerjoinpath', 'outerjoinpath', 'bitmapqual'):
    subpath = path.get(key, None)
    if subpath:
      yield subpath

def render_path(dot, path, container = None, stop = None):
  if not path:
    return None
  t = typename(path)
  if t == 'X-REF' and not container:
    if callable(stop) and stop(path):
      pass
    return path['X-REF']
  attrs = {}

  Id = container['id'] if container else path['x-id']

  if t == 'X-REF':
    attrs['shape'] = 'box'
    attrs['label'] = ''
  else:
    attrs['shape'] = 'plaintext'
    attrs['label'] = make_node_label(lines = [t,
                                              intcomma(path.get('rows', 0)),
                                              intcomma(path.get('total_cost', 0))],
                                     extra = path_extra(path))
  if container and container.get('isChosen', False):
    attrs.update(fillcolor='yellow', style='filled')

  dot.node(Id, **attrs)
  
  subpath = path.get('X-REF', None) 
  if subpath:
    dot.edge(Id, subpath)

  for key in ('subpath', 'innerjoinpath', 'outerjoinpath', 'bitmapqual'):
    subpath = render_path(dot, path.get(key, None), stop = stop)
    if subpath:
        dot.edge(Id, subpath)

  return Id

toplevel_path_to_rel = {}
toplevel_path = {}
for obj in data['roots']:
  for rel in obj['rels']:
      for path in rel['paths']:
        toplevel_path[path['id']] = path['data']
        toplevel_path_to_rel[path['id']] = id(rel)

icl = set()
icx = set()

def is_inter(path, rel):
  x = toplevel_path_to_rel.get(path.get('X-REF', None), None)
  if x and x != id(rel):
    icl.add((id(rel), x))
    icx.add((path.get('X-REF', None)))
    return True

dot = Digraph()
dot.node_attr.update(shape='rect')
for obj in data['roots']:
  for rel in obj['rels']:
    with dot.subgraph(name = 'cluster_{}'.format(id(rel))) as c:
      c.attr(label=rel['data'].get('relname', None), labelloc='b', style="dotted")
      paths = rel['paths']
      for path in paths:
        if len(paths) < 10 or path['id'] in icx:
          render_path(c, path['data'], path)

dot.attr(label=data['query'], labelloc='t')
print(dot.source)
#print(json.dumps(data, cls=MyEncoder))
