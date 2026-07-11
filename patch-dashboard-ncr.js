import fs from 'fs';
let content = fs.readFileSync('components/Dashboard.tsx', 'utf-8');

const statesToAdd = `  const [ncrList, setNcrList] = useState<NCR[]>([]);
  const [isLoadingNcrs, setIsLoadingNcrs] = useState(false);
  const [ncrGroupRange, setNcrGroupRange] = useState<'DAY'|'WEEK'|'MONTH'|'YEAR'>('DAY');
  const [selectedNcrDateKey, setSelectedNcrDateKey] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setIsLoadingNcrs(true);
    
    // Convert startDate/endDate to unixStart/unixEnd if needed, though getNcrs supports them natively if passed as filters?
    // Wait, in apiService fetchNcrs just passes filters.
    // Let's pass the same filters
    const ncrFilters = { ...filters };
    if (ncrFilters.startDate) {
        ncrFilters.unixStart = Math.floor(new Date(ncrFilters.startDate).getTime() / 1000);
    }
    if (ncrFilters.endDate) {
        ncrFilters.unixEnd = Math.floor(new Date(ncrFilters.endDate).getTime() / 1000) + 86399;
    }
    
    fetchNcrs(ncrFilters, 1, 10000)
      .then((res: any) => {
        if (active) {
            setNcrList(res.items || []);
        }
      })
      .catch((err: any) => console.error("Failed to load NCRs for dashboard", err))
      .finally(() => {
        if (active) setIsLoadingNcrs(false);
      });
      
    return () => { active = false; };
  }, [filters]);

  const ncrChartData = useMemo(() => {
    const grouped: Record<string, { dateLabel: string; count: number, originalDate: Date }> = {};
    
    ncrList.forEach(ncr => {
        const d = ncr.createdDate ? new Date(ncr.createdDate) : new Date(ncr.createdAt ? ncr.createdAt * 1000 : Date.now());
        if (isNaN(d.getTime())) return;
        
        let key = '';
        let label = '';
        
        if (ncrGroupRange === 'DAY') {
            key = d.toISOString().split('T')[0];
            label = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
        } else if (ncrGroupRange === 'WEEK') {
            const firstDay = new Date(d.setDate(d.getDate() - d.getDay() + 1));
            key = firstDay.toISOString().split('T')[0];
            label = \`Tuần \${Math.ceil((d.getDate() - 1 - d.getDay()) / 7) + 1} (\${firstDay.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })})\`;
        } else if (ncrGroupRange === 'MONTH') {
            key = \`\${d.getFullYear()}-\${d.getMonth()+1}\`;
            label = \`T\${d.getMonth()+1}/\${d.getFullYear()}\`;
        } else if (ncrGroupRange === 'YEAR') {
            key = \`\${d.getFullYear()}\`;
            label = \`Năm \${d.getFullYear()}\`;
        }
        
        if (!grouped[key]) {
            grouped[key] = { dateLabel: label, count: 0, originalDate: d };
        }
        grouped[key].count += 1;
    });
    
    return Object.entries(grouped)
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([key, val]) => ({
            key,
            name: val.dateLabel,
            count: val.count
        }));
  }, [ncrList, ncrGroupRange]);

  const filteredNcrList = useMemo(() => {
      if (!selectedNcrDateKey) return ncrList;
      return ncrList.filter(ncr => {
          const d = ncr.createdDate ? new Date(ncr.createdDate) : new Date(ncr.createdAt ? ncr.createdAt * 1000 : Date.now());
          if (isNaN(d.getTime())) return false;
          let key = '';
          if (ncrGroupRange === 'DAY') {
              key = d.toISOString().split('T')[0];
          } else if (ncrGroupRange === 'WEEK') {
              const firstDay = new Date(d.setDate(d.getDate() - d.getDay() + 1));
              key = firstDay.toISOString().split('T')[0];
          } else if (ncrGroupRange === 'MONTH') {
              key = \`\${d.getFullYear()}-\${d.getMonth()+1}\`;
          } else if (ncrGroupRange === 'YEAR') {
              key = \`\${d.getFullYear()}\`;
          }
          return key === selectedNcrDateKey;
      });
  }, [ncrList, selectedNcrDateKey, ncrGroupRange]);
`;

const stateInsertIndex = content.indexOf('const [projectOptions, setProjectOptions] = useState<any[]>([]);');
if (stateInsertIndex !== -1) {
    const nextLineIndex = content.indexOf('\n', stateInsertIndex) + 1;
    content = content.slice(0, nextLineIndex) + statesToAdd + content.slice(nextLineIndex);
}

fs.writeFileSync('components/Dashboard.tsx', content);
