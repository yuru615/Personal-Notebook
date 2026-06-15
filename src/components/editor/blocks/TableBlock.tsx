interface TableBlockProps {
  rows: string[][]
  onChange: (rows: string[][]) => void
}

export function TableBlock({ rows, onChange }: TableBlockProps) {
  return (
    <div className="table-block">
      {rows.map((row, rowIndex) => (
        <div key={rowIndex} className="table-row">
          {row.map((cell, cellIndex) => (
            <input
              key={`${rowIndex}-${cellIndex}`}
              className="table-cell"
              value={cell}
              onChange={(event) => {
                const nextRows = rows.map((currentRow) => [...currentRow])
                nextRows[rowIndex][cellIndex] = event.target.value
                onChange(nextRows)
              }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
