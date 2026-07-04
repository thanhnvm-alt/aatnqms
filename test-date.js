const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    
    let numStr = String(dateStr);
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(numStr)) {
        return numStr;
    }
    
    // Check if it's a numeric string or number
    if (/^\d+$/.test(numStr)) {
        const num = parseInt(numStr, 10);
        // if length is <= 10, it's seconds, else ms
        const d = new Date(num > 9999999999 ? num : num * 1000);
        if (!isNaN(d.getTime())) {
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            return `${day}/${month}/${year}`;
        }
    }
    
    const d = new Date(numStr);
    if (!isNaN(d.getTime())) {
        const day = String(d.getDate()).padStart(2, '0');
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const year = d.getFullYear();
        return `${day}/${month}/${year}`;
    }
    return numStr;
};
console.log(formatDate(1763301919));
console.log(formatDate('1763301919'));
console.log(formatDate('1763301919000'));
console.log(formatDate(1763301919000));
console.log(formatDate('25/08/2023'));
console.log(formatDate('2023-08-25T12:00:00Z'));
