import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App shell', () => {
  it('shows the core Chinese shell labels', () => {
    render(<App />)

    expect(screen.getByText('搜索')).toBeInTheDocument()
    expect(screen.getByText('首页')).toBeInTheDocument()
    expect(screen.getByText('新建页面')).toBeInTheDocument()
    expect(screen.getByText('未选择页面')).toBeInTheDocument()
  })
})
