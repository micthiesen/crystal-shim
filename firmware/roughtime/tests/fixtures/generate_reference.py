"""Offline reference-vector maintenance, never part of firmware or normal CI.

Requires PyCryptodomex 3.23.0 and pyroughtime.py revision
47535dc719f952dbb4faa98608c2430f9aa07144 on PYTHONPATH.
Only deterministic, public TEST keys are used. The reference transport is
replaced before query; no sockets, DNS or public service requests occur.
"""
import base64, hashlib, json, struct
from pathlib import Path
import pyroughtime as rt
from Cryptodome.Signature import eddsa

EXPECTED_REFERENCE_SHA256 = "9c4c69825ae86e8d1cd4684652715541a6601a0885a3c3874f06e660736e3014"
if hashlib.sha256(Path(rt.__file__).read_bytes()).hexdigest() != EXPECTED_REFERENCE_SHA256:
    raise RuntimeError("Unreviewed reference source; no fixtures written")

OUT=Path(__file__).resolve().parent
root_key=eddsa.import_private_key(bytes([41])*32)
root=eddsa.new(root_key,'rfc8032')
delegated_key=eddsa.import_private_key(bytes([79])*32)
delegated=eddsa.new(delegated_key,'rfc8032')
root_public=root_key.public_key().export_key(format='raw')
rt.secrets.token_bytes=lambda n: bytes([17])*n

def packet(name, values):
 p=rt.RoughtimePacket(name)
 for key,value in values: p.add_tag(rt.RoughtimeTag(key,value))
 return p

def offline_query(address,port,request,timeout):
 req=rt.RoughtimePacket(packet=request,expect_header=True)
 leaves=[bytes([index])*1036 for index in range(8)]
 leaves[5]=request
 tree=rt.RoughtimeServer._construct_merkle(leaves)
 path=rt.RoughtimeServer._construct_merkle_path(tree,5)
 dele=packet('DELE', [('PUBK',delegated_key.public_key().export_key(format='raw')),('MINT',struct.pack('<Q',0)),('MAXT',struct.pack('<Q',2**64-1))])
 cert=rt.RoughtimePacket('CERT')
 cert.add_tag(dele)
 cert.add_tag(rt.RoughtimeTag('SIG',root.sign(rt.RoughtimeServer.CERTIFICATE_CONTEXT+dele.get_value_bytes())))
 srep=packet('SREP',[('VER',struct.pack('<I',0x8000000c)),('VERS',struct.pack('<I',0x8000000c)),('MIDP',struct.pack('<Q',1800000000)),('RADI',struct.pack('<I',5)),('ROOT',tree[-1][0])])
 reply=packet('', [('NONC',req.get_tag('NONC').get_value_bytes()),('TYPE',struct.pack('<I',1)),('INDX',struct.pack('<I',5)),('PATH',path),('SIG',delegated.sign(rt.RoughtimeServer.SIGNED_RESPONSE_CONTEXT+srep.get_value_bytes()))])
 reply.add_tag(cert);reply.add_tag(srep)
 wire=reply.get_value_bytes(True)
 (OUT/'reference-tree.request.bin').write_bytes(request)
 (OUT/'reference-tree.response.bin').write_bytes(wire)
 return rt.RoughtimePacket(packet=wire,expect_header=True),100000000,180000000,wire

rt.RoughtimeClient._udp_query=staticmethod(offline_query)
result=rt.RoughtimeClient().query('no-network.invalid',2002,base64.b64encode(root_public).decode())
print(json.dumps({'reference_validation':'passed','network':'not used; _udp_query replaced with deterministic in-memory packet generator','root_public_hex':root_public.hex(),'request_sha256':hashlib.sha256((OUT/'reference-tree.request.bin').read_bytes()).hexdigest(),'response_sha256':hashlib.sha256((OUT/'reference-tree.response.bin').read_bytes()).hexdigest(),'index':5,'path_nodes':3},indent=2))
