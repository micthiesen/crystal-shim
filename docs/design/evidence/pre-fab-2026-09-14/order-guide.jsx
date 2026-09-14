function App() {
  const query = useQuery(tools.notion.notion_fetch.queryOptions({ id: '3db70643-efe0-8114-98e6-fa5e05ae8bb2' }));
  const [tab, setTab] = useState('boards');
  const [search, setSearch] = useState('');
  const [board, setBoard] = useState('all');
  const [detail, setDetail] = useState(null);
  if (query.isLoading) return <ArtifactLoading variant="table" rows={6} />;
  if (query.error) return <ArtifactError error={query.error} onRetry={query.refetch} />;
  let data;
  try {
    if (!query.data?.ok) throw new Error(query.data?.error?.message || 'Order data could not be loaded.');
    const page = JSON.parse(query.data.data.content.find(x => x.type === 'text').text);
    const match = page.text.match(/```json\s*([\s\S]*?)```/);
    if (!match) throw new Error('The order page has no release data.');
    data = JSON.parse(match[1]);
  } catch (error) { return <ArtifactError error={error} onRetry={query.refetch} />; }
  const parts = data.parts.filter(p => {
    const allocated = Object.values(p.board_allocations || {}).some(x => x.quantity_per_set > 0);
    return (board === 'all' || (board === 'offboard' ? !allocated : p.board_allocations?.[board]?.quantity_per_set > 0)) && JSON.stringify(p).toLowerCase().includes(search.toLowerCase());
  });
  return <div className="flex h-full flex-col gap-4 text-foreground">
    <div className="flex shrink-0 flex-wrap items-start justify-between gap-4">
      <div><h2 className="text-xl font-semibold tracking-tight">{data.title}</h2><div className="mt-1 font-mono text-xs text-muted-foreground">{data.date} · {data.status}</div></div>
      <a className="text-sm underline underline-offset-4" href={data.guide} target="_blank" rel="noreferrer">Open Full Instructions</a>
    </div>
    <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
      <div className="flex gap-2"><Button variant={tab === 'boards' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab('boards')}>PCB Orders</Button><Button variant={tab === 'parts' ? 'secondary' : 'ghost'} size="sm" onClick={() => setTab('parts')}>Parts BOM</Button></div>
      <span className="font-mono text-xs text-muted-foreground">{data.boards.length.toLocaleString()} boards · {data.pcb_component_count.toLocaleString()} components / set</span>
    </div>
    {tab === 'parts' && <div className="flex shrink-0 flex-wrap items-center gap-3">
      <Input className="h-8 min-w-0 flex-1" placeholder="Search MPN, reference or use" value={search} onChange={e => setSearch(e.target.value)} />
      <Select value={board} onValueChange={setBoard}><SelectTrigger className="h-8 w-40"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All Parts</SelectItem>{data.boards.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}<SelectItem value="offboard">Offboard</SelectItem></SelectContent></Select>
      <a href={data.bom_download} className="text-sm underline underline-offset-4" target="_blank" rel="noreferrer">Download CSV</a>
    </div>}
    <div className="min-h-0 flex-1 overflow-auto">
      {tab === 'boards' ? <div className="space-y-6">
        <div className="divide-y divide-border rounded-lg border border-border">{data.boards.map(b => <div key={b.id} className="space-y-3 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><div className="text-sm font-medium">{b.name}</div><div className="font-mono text-xs text-muted-foreground">{b.dimensions} · {b.layers.toLocaleString()} layers · {b.quantity.toLocaleString()} bare boards</div></div><a className="text-sm underline underline-offset-4" href={b.download} target="_blank" rel="noreferrer">Download PCB ZIP</a></div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><a href={b.stencil} target="_blank" rel="noreferrer" className="underline">Top Stencil</a><a href={b.schematic} target="_blank" rel="noreferrer" className="underline">Schematic PDF</a><a href={b.top} target="_blank" rel="noreferrer" className="underline">Front CAM</a><a href={b.bottom} target="_blank" rel="noreferrer" className="underline">Back CAM</a></div>
          <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">ZIP Checksum</summary><div className="mt-2 break-all font-mono">{b.sha256}</div></details>
        </div>)}</div>
        <div><div className="mb-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground">Form Settings</div><table className="w-full table-fixed text-sm"><thead><tr className="border-b border-border text-left"><th className="w-1/3 py-2 font-medium">Setting</th>{data.boards.map(b => <th key={b.id} className="p-2 font-medium">{b.name}</th>)}</tr></thead><tbody className="divide-y divide-border">{data.settings.map(s => <tr key={s.setting}><td className="py-2 pr-3 text-muted-foreground">{s.setting}</td>{data.boards.map(b => <td key={b.id} className="p-2 align-top">{s[b.id]}</td>)}</tr>)}</tbody></table></div>
        <div className="space-y-2 text-sm text-muted-foreground">{data.notes.map(n => <p key={n}>{n}</p>)}<div className="flex flex-wrap gap-4 pt-2"><a href={data.review} target="_blank" rel="noreferrer" className="underline">Review Evidence</a><a href={data.mechanical} target="_blank" rel="noreferrer" className="underline">Mounting Drawings</a><a href="https://cart.jlcpcb.com/quote" target="_blank" rel="noreferrer" className="underline">Open JLCPCB</a></div></div>
      </div> : <div>
        <p className="mb-3 text-xs text-muted-foreground">One complete set. Buy quantities include recommended spares. Check existing stock before purchasing. Select a row for references and sourcing notes.</p>
        {!parts.length ? <ArtifactEmpty title="No matching parts" description="Clear the search or choose another board." /> : <table className="w-full table-fixed text-sm"><thead className="sticky top-0 z-10 bg-background"><tr className="border-b border-border text-left"><th className="w-[32%] p-2 font-medium">Part / Specification</th><th className="w-[36%] p-2 font-medium">Use</th><th className="w-[12%] p-2 font-medium">Need</th><th className="w-[12%] p-2 font-medium">Buy</th><th className="w-[8%] p-2 font-medium"></th></tr></thead><tbody className="divide-y divide-border">{parts.map(p => <Fragment key={p.id}><tr className="cursor-pointer hover:bg-muted" onClick={() => setDetail(detail === p.id ? null : p.id)}><td className="break-words p-2 align-top"><span className="font-mono text-xs">{p.mpn_or_specification}</span><div className="mt-1 text-xs text-muted-foreground">{p.manufacturer}</div></td><td className="break-words p-2 align-top text-xs text-muted-foreground">{p.use}</td><td className="p-2 align-top font-mono text-xs">{p.required_quantity}<div className="font-sans text-muted-foreground">{p.unit}</div></td><td className="p-2 align-top font-mono text-xs">{p.suggested_buy_quantity}</td><td className="p-2 align-top"><a href={p.supplier_search_url || p.source_url} target="_blank" rel="noreferrer" onClick={e => e.stopPropagation()} aria-label="Find part"><ExternalLink className="size-4" /></a></td></tr>{detail === p.id && <tr><td colSpan={5} className="space-y-2 bg-muted p-3 text-xs"><div>{p.selection_status} · {p.purchase_status}</div><p>{p.notes}</p><div className="font-mono">{Object.entries(p.board_allocations || {}).filter(([b,a]) => a.quantity_per_set > 0).map(([b,a]) => b + ': ' + a.references.join(', ')).join(' · ')}</div>{p.source_url && <a className="inline-block underline" href={p.source_url} target="_blank" rel="noreferrer">Source / Datasheet</a>}</td></tr>}</Fragment>)}</tbody></table>}
      </div>}
    </div>
  </div>;
}
