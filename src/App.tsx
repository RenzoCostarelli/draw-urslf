import { BrowserRouter, Routes, Route } from 'react-router-dom'
import RootLayout from './layouts/RootLayout'
import LabLayout from './layouts/LabLayout'
import Home from './pages/Home'
import Lab from './pages/lab/index'
import DrawUrslf from './pages/lab/draw-urslf/index'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<RootLayout />}>
          <Route path="/" element={<Home />} />
          <Route element={<LabLayout />}>
            <Route path="/lab" element={<Lab />} />
            <Route path="/lab/draw-urslf" element={<DrawUrslf />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
