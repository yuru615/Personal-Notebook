import { render, screen } from '@testing-library/react'
import { App } from './App'

describe('App shell', () => {
  it('shows the core Chinese shell structure', () => {
    render(<App />)

    expect(screen.getByRole('button', { name: '搜索' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '首页' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: '新建页面' })).toBeInTheDocument()
    expect(screen.getByRole('main')).toBeInTheDocument()
    expect(screen.getByText('未选择页面')).toBeInTheDocument()
  })
})
