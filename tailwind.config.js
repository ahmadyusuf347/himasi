module.exports = {
  content: ['./views/**/*.ejs', './public/js/*.js'],
  theme: { extend: {
    colors: { brand: 'rgb(var(--brand) / <alpha-value>)', navy: 'rgb(var(--dark) / <alpha-value>)', foot: 'rgb(var(--foot) / <alpha-value>)', accent: 'rgb(var(--accent) / <alpha-value>)' },
    fontFamily: { head: ['"Barlow Condensed"', 'sans-serif'], body: ['"Plus Jakarta Sans"', 'sans-serif'] }
  } }
};
