import React from 'react'

export const EditorEmptyState: React.FC = () => {
  return (
    <div className="flex flex-1 flex-col justify-center mx-auto max-w-272">
      <p className="block text-center text-sm text-white/40">
        Clique sur un fichier pour commencer l'édition
      </p>

      {/*
      <div className=''>
        <NewTable />
      </div>
      */}
    </div>
  )
}
