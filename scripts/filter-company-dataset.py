"""Stream a permitted PDL company CSV/JSONL into small Open Career import batches.
No network, credentials, contact data, or dependency beyond Python standard library.
"""
import argparse,csv,json,pathlib,urllib.parse

def rows(path):
    with path.open(encoding='utf-8-sig',newline='') as f:
        if path.suffix.lower() in ('.jsonl','.ndjson'):
            for line in f:
                if line.strip(): yield json.loads(line)
        else: yield from csv.DictReader(f)

def select(record,country,domains,industries):
    website=str(record.get('website') or record.get('domain') or '').strip()
    host=urllib.parse.urlsplit(website if '://' in website else 'https://'+website).hostname
    if not host or '.' not in host: return None
    host=host.lower().removeprefix('www.')
    local=str(record.get('country') or '').casefold()==country.casefold()
    if not local and host not in domains: return None
    if industries and local and not any(x.casefold() in str(record.get('industry','')).casefold() for x in industries): return None
    return {'domain':host,'name':record.get('name') or '', 'industry':record.get('industry') or '',
            'country':record.get('country') or '', 'locality':record.get('locality') or '', 'region':record.get('region') or ''}

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('input',type=pathlib.Path);parser.add_argument('output',type=pathlib.Path)
    parser.add_argument('--country',default='saudi arabia');parser.add_argument('--include-domain',action='append',default=[])
    parser.add_argument('--industry',action='append',default=[]);parser.add_argument('--max-records',type=int,default=20000)
    args=parser.parse_args()
    if not 1<=args.max_records<=100000: parser.error('--max-records must be 1–100000')
    args.output.mkdir(parents=True,exist_ok=True)
    seen=set();batch=[];files=0;scanned=0
    def write():
        nonlocal files
        target=args.output/f'companies-{files+1:04d}.json'
        payload={'provider':'People Data Labs Free Company Dataset','source_url':'https://docs.peopledatalabs.com/docs/free-company-dataset','attribution':'People Data Labs, CC BY 4.0; filtered by Open Career. HQ country does not establish branch presence.','records':batch[:]}
        with target.open('x',encoding='utf-8') as f: json.dump(payload,f,ensure_ascii=False)
        files+=1;batch.clear()
    for record in rows(args.input):
        scanned+=1;selected=select(record,args.country,set(args.include_domain),args.industry)
        if not selected or selected['domain'] in seen:continue
        seen.add(selected['domain']);batch.append(selected)
        if len(batch)==100:write()
        if len(seen)>=args.max_records:break
    if batch:write()
    print(json.dumps({'scanned':scanned,'selected_companies':len(seen),'batches':files,'limit_reached':len(seen)>=args.max_records,'note':'Discovery only; no contacts or vacancies inferred.'}))
if __name__=='__main__':main()
