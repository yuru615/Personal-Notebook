import { Route, Routes } from 'react-router-dom'
import TablePage from '../components/table/TablePage'
import RecordPage from '../components/record/RecordPage'
import { AppStoreProvider } from '../store/AppStore'

export default function App() {
  return (
    <AppStoreProvider>
      <Routes>
        <Route path="/" element={<TablePage basePath="" />} />
        <Route path="/records/:recordId" element={<RecordPage basePath="" />} />
        <Route path="/record/:recordId" element={<RecordPage basePath="" />} />
      </Routes>
    </AppStoreProvider>
  )
}
