document.getElementById('add').addEventListener('click', () => {
  const p = document.createElement('p');
  p.textContent = 'A dynamically inserted $49 price.';
  document.getElementById('dynamic').append(p);
});
document.getElementById('update').addEventListener('click', () => {
  document.getElementById('changing').textContent = 'Current price: $75.';
});
document.getElementById('price-link').addEventListener('click', () => {
  document.getElementById('link-result').textContent = 'Original link listener still works.';
});
