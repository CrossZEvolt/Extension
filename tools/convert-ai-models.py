#!/usr/bin/env python3
"""Convert the pinned FSRCNN-small TensorFlow graphs without third-party packages.

The parser deliberately accepts only the protobuf fields and exact graph used by
the audited models. It is not a general TensorFlow importer. No network is used.
"""

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
import sys


REPOSITORY = 'https://github.com/Saafke/FSRCNN_Tensorflow'
COMMIT = '6a4812c4ef1c4f5947d79beafa32a05a6eb4a94d'
LICENSE_HASH = 'c71d239df91726fc519c6eb72d318ec65820627232b2f796219e87dcf35d0ab4'
SOURCE_HASHES = {
    2: '429e4793d049c1ae16ddbbc322fd11c3c08831c0c20137390b4d098976a2b0d9',
    3: '58e72d0c4231b8e754180e787d7348f45ae6230ee3c5af7dc12b558467f593f7',
}


def require(condition, message):
    if not condition:
        raise ValueError(message)


def read_varint(data, position):
    value = 0
    for shift in range(0, 70, 7):
        require(position < len(data), 'Truncated protobuf varint')
        byte = data[position]
        position += 1
        require(shift < 63 or byte < 2, 'Protobuf varint exceeds 64 bits')
        value |= (byte & 127) << shift
        if byte < 128:
            return value, position
    raise ValueError('Invalid protobuf varint')


def fields(data):
    position = 0
    while position < len(data):
        tag, position = read_varint(data, position)
        number, wire = tag >> 3, tag & 7
        require(number > 0, 'Invalid protobuf field number')
        if wire == 0:
            value, position = read_varint(data, position)
        elif wire in (1, 2, 5):
            if wire == 2:
                length, position = read_varint(data, position)
            else:
                length = 8 if wire == 1 else 4
            require(position + length <= len(data), 'Truncated protobuf field')
            value = data[position:position + length]
            position += length
        else:
            raise ValueError(f'Unsupported protobuf wire type: {wire}')
        yield number, wire, value


def singular(data, allowed):
    result = {}
    for number, wire, value in fields(data):
        require(number in allowed, f'Unexpected protobuf field: {number}')
        require(number not in result, f'Duplicate protobuf field: {number}')
        require(wire == allowed[number], f'Unexpected wire type for field {number}')
        result[number] = value
    return result


def tensor_shape(data):
    result = []
    for number, wire, value in fields(data):
        require((number, wire) == (2, 2), 'Unsupported tensor shape')
        dimension = singular(value, {1: 0})
        require(set(dimension) == {1}, 'Missing tensor dimension')
        require(0 < dimension[1] < 10000, 'Invalid tensor dimension')
        result.append(dimension[1])
    return result


def tensor(data):
    parts = list(fields(data))
    values_by_number = {}
    for number, wire, value in parts:
        require(number in (1, 2, 4, 5), f'Unsupported tensor field: {number}')
        values_by_number.setdefault(number, []).append((wire, value))
    require(len(values_by_number.get(1, [])) == 1, 'Missing tensor dtype')
    require(values_by_number[1][0][0] == 0, 'Invalid tensor dtype encoding')
    dtype = values_by_number[1][0][1]
    require(dtype in (1, 3), 'Only float32 and int32 tensors are supported')
    require(len(values_by_number.get(2, [])) == 1, 'Missing tensor shape')
    require(values_by_number[2][0][0] == 2, 'Invalid tensor shape encoding')
    shape = tensor_shape(values_by_number[2][0][1])
    require((4 in values_by_number) != (5 in values_by_number),
            'Expected exactly one tensor value encoding')
    if 4 in values_by_number:
        require(len(values_by_number[4]) == 1 and values_by_number[4][0][0] == 2,
                'Invalid tensor content')
        content = values_by_number[4][0][1]
    else:
        require(dtype == 1, 'Only float32 supports float_val encoding')
        require(all(wire in (2, 5) for wire, _ in values_by_number[5]),
                'Invalid float32 encoding')
        content = b''.join(value for _, value in values_by_number[5])
    require(len(content) == math.prod(shape) * 4, 'Tensor value count does not match shape')
    values = list(struct.unpack('<' + ('f' if dtype == 1 else 'i') * (len(content) // 4), content))
    require(all(math.isfinite(value) for value in values), 'Tensor contains nonfinite values')
    return {'dtype': dtype, 'shape': shape, 'values': values}


def attribute(data):
    parts = list(fields(data))
    require(len(parts) == 1, 'Expected a single attribute value')
    number, wire, value = parts[0]
    if (number, wire) == (1, 2):
        items = singular(value, {3: 2})
        require(set(items) == {3}, 'Only packed integer list attributes are supported')
        result, position = [], 0
        while position < len(items[3]):
            item, position = read_varint(items[3], position)
            result.append(item)
        return result
    if (number, wire) == (2, 2):
        return value
    if wire == 0 and number in (3, 5, 6):
        return value
    if (number, wire) == (8, 2):
        return tensor(value)
    raise ValueError(f'Unsupported attribute encoding: {number}/{wire}')


def parse_graph(data):
    graph = {}
    for number, wire, value in fields(data):
        if number == 2 and wire == 2:
            require(value == b'', 'Graph functions are not supported')
            continue
        if number == 4 and wire == 2:  # GraphDef.versions is metadata, not an operation.
            singular(value, {1: 0, 2: 0, 3: 2})
            continue
        require((number, wire) == (1, 2), 'Unsupported GraphDef field')
        node = {'inputs': [], 'attributes': {}}
        for node_number, node_wire, node_value in fields(value):
            require(node_wire == 2, 'Unexpected node field encoding')
            if node_number in (1, 2):
                key = 'name' if node_number == 1 else 'op'
                require(key not in node, f'Duplicate node {key}')
                node[key] = node_value.decode('utf-8')
            elif node_number == 3:
                node['inputs'].append(node_value.decode('utf-8'))
            elif node_number == 5:
                entry = singular(node_value, {1: 2, 2: 2})
                require(set(entry) == {1, 2}, 'Incomplete node attribute')
                key = entry[1].decode('utf-8')
                require(key not in node['attributes'], 'Duplicate node attribute')
                node['attributes'][key] = attribute(entry[2])
            else:
                raise ValueError(f'Unsupported node field: {node_number}')
        require('name' in node and 'op' in node, 'Incomplete graph node')
        name = node.pop('name')
        require(name not in graph, f'Duplicate graph node: {name}')
        graph[name] = node
    require(bool(graph), 'Empty graph')
    return graph


def model_from_graph(graph, scale):
    require(scale in SOURCE_HASHES, 'Only scales 2 and 3 are supported')
    expected_names = set()

    def node(name, op, inputs, attributes):
        expected_names.add(name)
        require(name in graph, f'Missing node: {name}')
        actual = graph[name]
        require(actual['op'] == op, f'Unexpected operation for {name}')
        require(actual['inputs'] == inputs, f'Unexpected inputs for {name}')
        require(actual['attributes'] == attributes, f'Unexpected attributes for {name}')

    def constant(name, shape, dtype=1):
        require(name in graph, f'Missing constant: {name}')
        actual = graph[name]['attributes'].get('value')
        require(isinstance(actual, dict), f'Invalid tensor for {name}')
        require(actual.get('dtype') == dtype and actual.get('shape') == shape,
                f'Unexpected dtype or shape for {name}')
        values = actual.get('values', [])
        require(len(values) == math.prod(shape), f'Unexpected value count for {name}')
        require(all(isinstance(value, (int, float)) and math.isfinite(value) for value in values),
                f'Nonfinite or invalid values for {name}')
        node(name, 'Const', [], {'dtype': dtype, 'value': actual})
        return values

    def suffixed(name, index):
        return name if index == 0 else f'{name}_{index}'

    node('IteratorGetNext', 'Placeholder', [], {'dtype': 1})
    layers = []
    source = 'IteratorGetNext'
    dimensions = [(5, 1, 32), (1, 32, 5), (3, 5, 5), (1, 5, 32), (1, 32, scale ** 2)]
    for index, (kernel, inputs, outputs) in enumerate(dimensions):
        number = index + 1
        weights = constant(f'f{number}', [kernel, kernel, inputs, outputs])
        node(f'conv{number}', 'Conv2D', [source, f'f{number}'], {
            'T': 1, 'data_format': b'NHWC', 'strides': [1, 1, 1, 1],
            'dilations': [1, 1, 1, 1], 'padding': b'SAME', 'use_cudnn_on_gpu': 1,
        })
        bias, alpha = None, None
        if index < 4:
            bias = constant(f'b{number}', [outputs])
            alpha = constant(f'alpha{number}', [outputs])
            added = suffixed('add', index * 2)
            absolute = suffixed('Abs', index)
            subtracted = suffixed('sub', index)
            multiplied = suffixed('mul', index * 2)
            halved = suffixed('mul', index * 2 + 1)
            rectified = suffixed('Relu', index)
            source = suffixed('add', index * 2 + 1)
            half = constant(f'{halved}/y', [])
            require(half == [0.5], f'Unexpected PReLU coefficient for {halved}')
            for name, op, arguments in [
                (added, 'Add', [f'conv{number}', f'b{number}']),
                (absolute, 'Abs', [added]),
                (subtracted, 'Sub', [added, absolute]),
                (multiplied, 'Mul', [f'alpha{number}', subtracted]),
                (halved, 'Mul', [multiplied, f'{halved}/y']),
                (rectified, 'Relu', [added]),
                (source, 'Add', [rectified, halved]),
            ]:
                node(name, op, arguments, {'T': 1})
        layers.append({'kernelSize': kernel, 'inChannels': inputs, 'outChannels': outputs,
                       'weights': weights, 'bias': bias, 'alpha': alpha})
    output_bias = constant('b5', [1])[0]
    node('DepthToSpace', 'DepthToSpace', ['conv5'],
         {'T': 1, 'data_format': b'NHWC', 'block_size': scale})
    node('NHWC_output', 'BiasAdd', ['DepthToSpace', 'b5'],
         {'T': 1, 'data_format': b'NHWC'})
    permutation = constant('NCHW_output/perm', [4], 3)
    require(permutation == [0, 3, 1, 2], 'Unexpected output transpose')
    node('NCHW_output', 'Transpose', ['NHWC_output', 'NCHW_output/perm'],
         {'T': 1, 'Tperm': 3})
    require(set(graph) == expected_names,
            f'Unexpected graph nodes: {sorted(set(graph) - expected_names)}')
    return {
        'schemaVersion': 1, 'name': 'FSRCNN-small', 'scale': scale, 'halo': 3,
        'layers': layers, 'outputBias': output_bias,
        'source': {'repository': REPOSITORY, 'commit': COMMIT,
                   'file': f'models/FSRCNN-small_x{scale}.pb', 'sha256': SOURCE_HASHES[scale]},
        'license': 'Apache-2.0',
    }


def checked_source(path, expected):
    data = path.read_bytes()
    require(hashlib.sha256(data).hexdigest() == expected, f'SHA-256 mismatch: {path}')
    return data


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source-dir', type=Path, required=True,
                        help=f'Checkout or archive of {REPOSITORY} at {COMMIT}')
    parser.add_argument('--output-dir', type=Path,
                        default=Path(__file__).resolve().parents[1] / 'src/models')
    parser.add_argument('--check', action='store_true',
                        help='Compare existing outputs byte for byte without writing')
    arguments = parser.parse_args(argv)
    try:
        outputs = {}
        for scale in (2, 3):
            source = arguments.source_dir / f'models/FSRCNN-small_x{scale}.pb'
            model = model_from_graph(parse_graph(checked_source(source, SOURCE_HASHES[scale])), scale)
            outputs[f'fsrcnn-small-x{scale}.json'] = (
                json.dumps(model, ensure_ascii=True, allow_nan=False, separators=(',', ':')) + '\n'
            ).encode('utf-8')
        outputs['LICENSE-FSRCNN.txt'] = checked_source(arguments.source_dir / 'LICENSE', LICENSE_HASH)
        for name, content in outputs.items():
            destination = arguments.output_dir / name
            if arguments.check:
                require(destination.is_file() and destination.read_bytes() == content,
                        f'Existing asset does not match deterministic conversion: {destination}')
            else:
                arguments.output_dir.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(content)
        print(f'{"Verified" if arguments.check else "Converted"} two pinned FSRCNN-small models and license.')
        return 0
    except (OSError, ValueError, UnicodeError, struct.error) as error:
        print(f'Conversion failed: {error}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
