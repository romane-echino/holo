import React from 'react';

const index: React.FC<{}> = () => {
	return <main style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '48px auto', lineHeight: 1.6 }}>
		<h1>Holo — relais temps réel</h1>
		<p>
			Ce projet relaie les modifications des documents Holo ouverts par plusieurs personnes
			en même temps. Il n'a pas d'interface : configurez son adresse dans Holo
			(Paramètres → Collaboration en temps réel).
		</p>
	</main>;
};

export default index;
