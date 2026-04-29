import React, { use, useEffect } from 'react';

interface NewTableProps {
    // Add your props here
}

const NewTable: React.FC<NewTableProps> = ({ }) => {
    const [markdown, setMarkdown] = React.useState<string>('');
    const [rows, setRows] = React.useState<number>(2);
    const [focusRef, setFocusRef] = React.useState<{ row: number; col: number } | null>(null);

    const [colHover, setColHover] = React.useState<number | null>(null);
    const [addColHover, setAddColHover] = React.useState<number | null>(null);

    const [content, setContent] = React.useState<string[][]>([
        ['', ''],
        ['', ''],
    ]);

    const [columns, setColumns] = React.useState<{
        title: string;
        type: 'text' | 'number' | 'date' | 'boolean';
    }[]>([
        { title: 'Column 1', type: 'text' },
        { title: 'Column 2', type: 'text' },
    ]);

    const updateMarkdown = () => {
        let result = ``;
        const header = columns.map(col => col.title).join(' | ');
        const separator = columns.map(() => '---').join(' | ');
        result = `| ${header} |\n| ${separator} |\n`;

        result += content.map(row => `| ${row.join(' | ')} |`).join('\n');
        setMarkdown(result);
    };

    const addColumnAfter = (index: number) => {
        alert(index);
        const newColumns = [...columns];
        newColumns.splice(index + 1, 0, { title: `Column ${columns.length + 1}`, type: 'text' });
        // move content of cells to the right
        const newContent = content.map(row => {
            const newRow = [...row];
            newRow.splice(index + 1, 0, '');
            return newRow;
        });
        setContent(newContent);
        setColumns(newColumns);
    }

    const setContentAt = (row: number, col: number, value: string) => {
        const newContent = [...content];
        newContent[row][col] = value;
        setContent(newContent);
    }

    const setColumnTitle = (col: number, title: string) => {
        const newColumns = [...columns];
        newColumns[col].title = title;
        setColumns(newColumns);
    }

    useEffect(() => {
        updateMarkdown();
    }, [content, columns]);


    return (
        <>

            <div className='pl-8'>

                <table className='h-6 w-full table-fixed'>

                    <tbody>
                        <tr>
                            {columns.map((col, index) => (
                                <td className='h-6' key={index} onMouseEnter={() => setColHover(index)} onMouseLeave={() => setColHover(null)}>
                                    {colHover === index ? (
                                        <div className='grid grid-cols-[auto_1fr_auto] h-6'>
                                            <div 
                                             onMouseEnter={() => setAddColHover(index-1)}
                                            onMouseLeave={() => setAddColHover(null)}
                                            onClick={() => addColumnAfter(index-1)}
                                            className={`w-6 h-6 border-2 cursor-pointer rounded-full flex -ml-3 items-center justify-center ${addColHover === index-1 ? 'border-purple-500' : 'border-transparent '}`}>
                                               {addColHover === index-1 ?
                                                <i className='fa fa-plus text-[10px] text-purple-500'></i>
                                               :
                                               <i className='fa fa-dot text-[10px] text-[#808080]'></i>}
                                            </div>
                                            <div className='flex items-center justify-center'>
                                                <i className='fa fa-grip-dots text-[10px] text-[#808080]'></i>
                                            </div>
                                            <div 
                                            onMouseEnter={() => setAddColHover(index)}
                                            onMouseLeave={() => setAddColHover(null)}
                                            onClick={() => addColumnAfter(index)}
                                            className={`w-6 h-6 border-2 cursor-pointer rounded-full flex -mr-3 items-center justify-center ${addColHover === index ? 'border-purple-500' : 'border-transparent '}`}>
                                               {addColHover === index ?
                                                <i className='fa fa-plus text-[10px] text-purple-500'></i>
                                               :
                                               <i className='fa fa-dot text-[10px] text-[#808080]'></i>}
                                            </div>
                                        </div>
                                    ) : (
                                        <div>&nbsp;</div>
                                    )}
                                </td>
                            ))}
                        </tr>
                    </tbody>
                </table>
            </div>
            <div className='rounded-[8px] border border-[#525252] overflow-hidden text-sm'>
                <table className='border-collapse w-full table-fixed'
                    onBlur={() => setFocusRef(null)}
                >
                    <thead>

                        <tr className='border-b border-[#525252]'>
                            <th className='w-8 h-11 bg-black border-r border-[#525252]'>&nbsp;</th>
                            {columns.map((col, index) => (
                                <th className='h-11 bg-black border-r border-[#525252] last:border-0 relative cursor-pointer'
                                    onMouseEnter={() => setColHover(index)}
                                    onMouseLeave={() => setColHover(null)}
                                    key={index}>

                                    <div
                                        className="w-full min-h-11 px-3 py-2 outline-none text-left flex items-center"
                                        spellCheck="false"
                                        autoCapitalize="sentences"
                                        aria-autocomplete="none"
                                        data-gramm_editor="false"
                                        role="textbox"
                                        contentEditable
                                        onInput={(e) => setColumnTitle(index, (e.target as HTMLDivElement).innerText)}
                                        onFocus={() => setFocusRef({ row: -1, col: index })}
                                    >
                                        {col.title}
                                    </div>

                                    {focusRef?.row === -1 && focusRef?.col === index && (
                                            <div className='border-2 border-purple-500 absolute inset-0 rounded'></div>
                                        )}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {Array.from({ length: rows }).map((_, rowIndex) => (
                            <tr key={rowIndex} className="hover:bg-black border-b border-[#525252] group last:border-0">
                                <td className="w-8 min-h-11 text-[#808080] text-center align-center relative border-r border-[#525252]">
                                    <div className='group-hover:hidden'>{rowIndex + 1}</div>

                                    <div className='hidden flex-col justify-between group-hover:flex absolute  inset-y-0'>
                                        <div><i className='fa fa-dot text-[10px] text-[#808080]'></i></div>
                                        <div><i className='fa fa-grip-dots-vertical text-[10px] text-[#808080]'></i></div>
                                        <div><i className='fa fa-dot text-[10px] text-[#808080]'></i></div>
                                    </div>
                                </td>

                                {columns.map((col, colIndex) => (
                                    <td
                                        key={colIndex}
                                        className="min-h-11  align-top p-0 cursor-text relative border-r border-[#525252] last:border-0"
                                        onMouseEnter={() => setColHover(colIndex)}
                                        onMouseLeave={() => setColHover(null)}
                                        onClick={(e) => {
                                            const div = (e.currentTarget as HTMLTableCellElement).querySelector('[contentEditable]') as HTMLDivElement;
                                            div?.focus();
                                        }}
                                    >
                                        <div
                                            className="w-full min-h-11 px-3 py-2 outline-none flex items-center"
                                            spellCheck="false"
                                            autoCapitalize="sentences"
                                            aria-autocomplete="none"
                                            data-gramm_editor="false"
                                            role="textbox"
                                            contentEditable
                                            onInput={(e) => setContentAt(rowIndex, colIndex, (e.target as HTMLDivElement).innerText)}
                                            onFocus={() => setFocusRef({ row: rowIndex, col: colIndex })}
                                        />

                                        {focusRef?.row === rowIndex && focusRef?.col === colIndex && (
                                            <div className='border-2 border-purple-500 absolute inset-0 rounded'></div>
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

            <div>
                <button className='cursor-pointer px-4 flex items-center mt-2' onClick={() => setRows(rows + 1)}>
                    <i className="fa-solid fa-plus mr-2 text-[10px]" />
                    <span className='font-semibold'>Nouveau</span>
                </button>
            </div>


            <pre className='bg-black mt-2 text-sm p-4'>
                {markdown}
            </pre>
        </>

    );
};

export default NewTable;