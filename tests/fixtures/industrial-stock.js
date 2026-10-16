export const industrialBrands=['GATES','CONTINENTAL','OPTIBELT','MEGADYNE','BANDO','DAYCO'];
export const industrialStock=industrialBrands.flatMap((brand,i)=>[
 {id:`b-${i}`,sku:`B72-${i}`,name:'CORREIA EM V',variant:'B72',brand,price:50+i*10,quantity:50,unit:'Peça (PC)'},
 {id:`a-${i}`,sku:`A89-${i}`,name:'CORREIA EM V',variant:'A89',brand,price:40+i*10,quantity:50,unit:'Peça (PC)'},
 {id:`v-${i}`,sku:`3VX500-${i}`,name:'CORREIA EM V',variant:'3VX500',brand,price:60+i*10,quantity:50,unit:'Peça (PC)'},
 {id:`pk-cut-${i}`,sku:`PK650-FRI-${i}`,name:'CORREIA MICRO V PK650 50 FRISOS',variant:'',brand,price:7+i,quantity:100,unit:'Friso (FRI)'},
 {id:`pk-piece-${i}`,sku:`4PK650-PC-${i}`,name:'CORREIA MICRO V',variant:'4PK650',brand,price:34+i*5,quantity:20,unit:'Peça (PC)'},
]);
