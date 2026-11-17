import { fireEvent, render, screen } from '@testing-library/react';
import App from '../../src/App';
import { strings } from '../../src/strings';

describe('App shell', () => {
  it('renders the top bar, empty state and stats bar', () => {
    render(<App />);
    expect(screen.getByRole('heading', { name: strings.appName })).toBeInTheDocument();
    expect(screen.getByTestId('empty-state')).toBeInTheDocument();
    expect(screen.getByTestId('stats-bar')).toHaveTextContent(strings.status.noVault);
  });

  it('starts with lens and preview panels collapsed and toggles them open', () => {
    render(<App />);
    expect(screen.queryByRole('complementary', { name: strings.lens.title })).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: strings.preview.title })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: strings.topBar.toggleLenses }));
    fireEvent.click(screen.getByRole('button', { name: strings.topBar.togglePreview }));

    expect(screen.getByRole('complementary', { name: strings.lens.title })).toBeVisible();
    expect(screen.getByRole('complementary', { name: strings.preview.title })).toBeVisible();
  });
});
