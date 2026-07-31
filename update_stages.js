const fs = require('fs');

const data = JSON.parse(fs.readFileSync('data/stages.json', 'utf8'));

data[0].content = 'Lograstes espertar ao Vixía no Facho, pero a guerra non rematou. A Néboa retrocedeu cara ao mar, fuxindo do Escudo de Luz. Pero foi unha vitoria temporal.';
data[1].content = 'A Néboa non se disipou: reagrupouse nas augas do Lago de Castiñeiras e está a crear un Eco — unha copia espectral do Vixía, corrompida e baleira. Se o Eco completa o seu ritual antes de que anoiteza, o Vixía quedará atrapado para sempre.';
data[2].content = 'A ascensión culmina no Vértice Xeodésico de Cotorredondo, o punto máis alto da ruta. Dende aquí, a Néboa pode ver todo o val, pero tamén expón a súa verdadeira magnitude ante os ollos de quen a desafía.';
data[3].content = 'Avanzando pola Senda do Silencio, as árbores están mudas e o vento non move as follas; a Néboa bloqueou os circuítos de comunicación do bosque.';
data[4].content = 'Este lugar parece normal, pero a realidade está deformada: as árbores crecen en espiral e as sombras apuntan na dirección equivocada, a piques de ser absorbidas polo outro plano.';
data[5].content = 'Máis arriba, dende o Mirador de Troia, podería verse todo o val, pero o horizonte está borrado pola presenza escura — non deixa ver onde termina o mundo real e onde comeza o dominio da Néboa.';
data[6].content = 'Máis adiante atópase a Mámoa do Rei, unha construción que ten miles de anos, cuxa enerxía ancestral está a ser usada pola Néboa como amplificador, tragando a calquera que intente resistir a corrente espectral.';
data[7].content = 'O Camiño da Costa revela ser das primeras zonas en caer baixo este control.';
data[8].content = 'Tras o descenso final, o camiño volve ao punto de orixe. No Lago, o Eco do Vixía agarda. A súa forma espectral trema sobre a auga, case completa. É o momento crítico para enfrontarse á copia corrompida, disolver o Eco e facer que o lago volva á calma para que o Vixía quede, por fin, libre.';
data[9].content = 'O camiño continúa cara ao Xardín Doutros Mundos. A Néboa comeza a disiparse, e a paz volve ao bosque.';

fs.writeFileSync('data/stages.json', JSON.stringify(data, null, 2), 'utf8');
console.log('Stages updated successfully!');
