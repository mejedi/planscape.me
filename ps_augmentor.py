import augmentor

class PlanscapeAugmentor(augmentor.Augmentor):

  def __init__(self, ps_json):
    self._types = dict(((t['oid'], t) for t in ps_json['types']))
    self._operators = dict(((op['oid'], op) for op in ps_json['operators']))
    self._functions = dict(((fn['oid'], fn) for fn in ps_json['functions']))

  def begin(self):
    self._variables = []
    self._links = []

  def end(self, tree):
    return {'data': tree, 'variables': self._variables, 'links': self._links}

  @augmentor.node_handler
  def VAR(self, node):
    var = super(PlanscapeAugmentor, self).VAR(node)
    self._variables.append(var)
    return var

  @augmentor.node_handler("X-REF")
  def XREF(self, node):
    xref = super(PlanscapeAugmentor, self).XREF(node)
    self._links.append(xref['X-REF'])
    return xref

  def lookup_type_name(self, oid):
    typ = self._types.get(oid, None)
    return typ['name'] if typ else None

  def lookup_function_name(self, oid):
    func = self._functions.get(oid, None)
    return func['name'] if func else None

  def lookup_operator_name(self, oid):
    operator = self._operators.get(oid, None)
    return operator['name'] if operator else None
