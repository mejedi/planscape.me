import re
import augmentor

class NodeToStringDataParser:

    _tokeniser = re.compile(r'(?:\d+\s+\[)|(?:[(){}\]])|(?:[^\s)}\]]+)')
    _keywords = {'<>': None, 'true': True, 'false': False}

    def __init__(self, augmentor = augmentor.Augmentor()):
      self._augmentor = augmentor

    def augment_node(self, typeid, node):
      return self._augmentor.augment(typeid, node)

    def parse(self, data):
      self._token_stream = iter(self._tokeniser.findall(data))
      self._augmentor.begin()
      return self._augmentor.end(self._build_ast())

    def _build_ast(self, lookahead = None):
      token_stream = self._token_stream
      token = lookahead or next(token_stream)
      if token == '(':
        '''A list.'''
        lres = []
        for token in token_stream:
          if token != ')':
            lres.append(self._build_ast(token))
          else:
            return lres
      elif token == '{':
        '''A node.'''
        typeid = next(token_stream)
        if typeid == '}': # unrecognized node type
          return {}
        node = {typeid:''}
        token = next(token_stream)
        while token != '}':
          assert(token.startswith(':'))
          key = token[1:]
          values = []
          '''Certain nodes, like MergeJoin, output multiple values for a
          single attribute, ex: {MERGEJOIN :mergeFamilies 1 2 3}'''
          for token in token_stream:
            if token == '}' or token.startswith(':'):
              break
            values.append(self._build_ast(token))
          node[key] = values[0] if len(values)==1 else values
        return self.augment_node(typeid, node)
      elif token in self._keywords:
        '''Builtin entities like True and False.'''
        return self._keywords[token]
      elif token.endswith('['):
        '''Binary datum starter, ex: 8 ['''
        blen = int(token.split()[0])
        bdata = []
        for token in token_stream:
          if token != ']':
            bdata.append((256 + int(token)) % 256)
          else:
            '''Sometimes excess bytes are being output.'''
            assert(blen <= len(bdata))
            return bytes(bdata[:blen])
      else:
        '''Maybe a number?'''
        try:
          return int(token)
        except ValueError:
          pass
        try:
          return float(token)
        except ValueError:
          return token

def parse_nodetostring_data(data, augmentor=augmentor.Augmentor()):
  '''Parse a string produced by nodeToString() and returns an AST.
  
  AST is made of regular Python types making it possible to pprint it.
  '''
  return NodeToStringDataParser(augmentor).parse(data)

