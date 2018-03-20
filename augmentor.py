def node_handler(arg):
  def wrap(fn):
    fn.node_typename = typename
    return fn
  if callable(arg):
    typename = ""
    return wrap(arg)
  typename = arg
  return wrap

class AugmentorMetaclass(type):
  def __init__(cls, name, bases, dct):
    super(AugmentorMetaclass, cls).__init__(name, bases, dct)
    node_dispatch_table = {}
    for base in bases:
      node_dispatch_table.update(getattr(base, '_node_dispatch_table', {}))
    for k, v in dct.items():
      node_typename = getattr(v, 'node_typename', None)
      if node_typename != None and callable(v):
        node_dispatch_table[node_typename or k] = v
    setattr(cls, '_node_dispatch_table', node_dispatch_table)

class Augmentor(metaclass = AugmentorMetaclass):

  def augment(self, typeid, node):
    handler = self._node_dispatch_table.get(typeid)
    return handler(self, node) if handler else node

  def begin(self):
    pass

  def end(self, tree):
    return tree

  @node_handler('X-REF')
  def XREF(self, xref):
    xid = xref.get('x-id', None)
    xref['X-REF'] = xid
    del xref['x-id']
    return xref

  @node_handler
  def CONST(self, c):
    xconstvalue = c.get('x-constvalue', None)
    if xconstvalue:
      assert(xconstvalue[-1] == 0)
      c['CONST'] = xconstvalue[:-1].decode('ascii')
      del c['x-constvalue']
      del c['constvalue']
    self.resolve_type(c, 'consttype')
    return c

  @node_handler
  def OPEXPR(self, x):
    operator = self.lookup_operator_name(x.get('opno', None))
    if operator:
      x['OPEXPR'] = operator
      del x['opno']
    opfunc = self.lookup_function_name(x.get('opfuncid', None))
    if opfunc:
      x['opfunc'] = opfunc
      del x['opfuncid']
    self.resolve_type(x, 'opresulttype')
    return x

  @node_handler
  def VAR(self, v):
    self.resolve_type(v, 'vartype')
    return v

  def resolve_type(self, obj, key):
    typ = self.lookup_type_name(obj.get(key, None))
    if typ:
      obj[key] = typ

  def lookup_type_name(self, oid):
    pass

  def lookup_function_name(self, oid):
    pass

  def lookup_operator_name(self, oid):
    pass

