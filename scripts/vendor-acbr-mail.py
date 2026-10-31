"""Copy the source-only ACBrMail dependency closure, preserving original bytes/licences."""
import argparse, hashlib, json, pathlib, re, shutil
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('source',type=pathlib.Path)
args=parser.parse_args()
source=args.source.resolve()
target=pathlib.Path(__file__).resolve().parent.parent/'modules/acbr-mail'
folders=['ACBrTCP','ACBrComum','Terceiros/synalist']
index={p.stem.lower():p for f in folders for p in (source/'Fontes'/f).glob('*.pas')}
includes={p.name.lower():p for f in folders for p in (source/'Fontes'/f).glob('*.inc')}
pending=[index['acbrmail']]; selected=set()
while pending:
    item=pending.pop()
    if item in selected: continue
    selected.add(item)
    text=item.read_bytes().decode('cp1252')
    for name in re.findall(r'\{\$I(?:NCLUDE)?\s+([^} ]+)\s*\}',text,re.I):
        dep=includes.get(name.lower())
        if dep: pending.append(dep)
    text=re.sub(r'\{.*?\}|\(\*.*?\*\)|//[^\n]*',' ',text,flags=re.S)
    for units in re.findall(r'\buses\b(.*?);',text,re.I|re.S):
        for unit in re.findall(r'\b[A-Za-z_][A-Za-z_0-9.]*\b',units):
            dep=index.get(unit.lower())
            if dep:pending.append(dep)
target.mkdir(parents=True,exist_ok=True)
manifest={}
for item in sorted(selected):
    name=item.relative_to(source/'Fontes')
    dest=target/name;dest.parent.mkdir(parents=True,exist_ok=True)
    shutil.copyfile(item,dest);manifest[name.as_posix()]=hashlib.sha256(dest.read_bytes()).hexdigest()
shutil.copyfile(source/'Doctos/LICENSE.TXT',target/'LICENSE.TXT')
(target/'source-manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
print(json.dumps({'files':len(manifest),'bytes':sum(p.stat().st_size for p in selected)}))
