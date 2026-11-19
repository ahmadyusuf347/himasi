require('dotenv').config();
require('./app').listen(process.env.PORT || 3000, () => console.log('Website: http://localhost:3000  |  CMS: http://localhost:3000/admin'));
