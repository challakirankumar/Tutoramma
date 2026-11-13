/**
 * Tutor Amma — Curriculum topic & sub-topic bank.
 *
 * Shared syllabus detail keyed by subject → grade → chapter name.
 * Every verified board reuses this bank (with its own source label), so the
 * chapter > topic > sub-topic tree is authored once and stays consistent.
 *
 * Shape: TopicSpec { t: topic title, s: sub-topic names }
 */

export interface TopicSpec {
  t: string;
  s: string[];
}

/* ------------------------------ MATHEMATICS ------------------------------ */

export const MATH_TOPICS: Record<string, Record<string, TopicSpec[]>> = {
  "Grade 6": {
    "Knowing Our Numbers": [
      { t: "Comparing Numbers", s: ["Place value", "Ascending / descending order", "Forming greatest & smallest numbers"] },
      { t: "Large Numbers in Practice", s: ["Estimation & rounding off", "Using brackets", "Roman numerals"] },
      { t: "Measurement & Units", s: ["Conversion of units", "Word problems with units"] },
    ],
    "Whole Numbers": [
      { t: "The Number Line", s: ["Successor & predecessor", "Operations on the line"] },
      { t: "Properties of Whole Numbers", s: ["Closure", "Commutativity & associativity", "Distributivity"] },
      { t: "Patterns in Whole Numbers", s: ["Numbers as dots", "Squares & triangles patterns"] },
    ],
    "Playing with Numbers": [
      { t: "Factors and Multiples", s: ["Divisibility rules", "Common factors & multiples"] },
      { t: "Prime and Composite Numbers", s: ["Sieve of Eratosthenes", "Prime factorisation"] },
      { t: "Tests of Divisibility", s: ["By 2, 5 and 10", "By 3 and 9", "By 4 and 8"] },
      { t: "HCF and LCM", s: ["Common division method", "Word problems"] },
    ],
    "Basic Geometrical Ideas": [
      { t: "Points, Lines and Planes", s: ["Point, line & ray", "Intersecting & parallel lines"] },
      { t: "Curves and Polygons", s: ["Simple & closed curves", "Sides, vertices & diagonals"] },
      { t: "Angles", s: ["Interior & exterior", "Angle bisector idea"] },
      { t: "Circles", s: ["Centre, radius & chord", "Diameter & circumference"] },
    ],
    "Understanding Elementary Shapes": [
      { t: "Measuring Line Segments", s: ["Ruler & divider use", "Comparing segments"] },
      { t: "Types of Angles", s: ["Acute, right & obtuse", "Straight & reflex angles"] },
      { t: "Perpendicular Lines", s: ["Perpendicular bisector", "Protractor construction"] },
      { t: "Three-Dimensional Shapes", s: ["Faces, edges & vertices", "Prism & pyramid nets"] },
    ],
    Integers: [
      { t: "Integers on the Number Line", s: ["Positive & negative integers", "Ordering integers"] },
      { t: "Operations with Integers", s: ["Addition rules", "Subtraction rules"] },
      { t: "Real-life Integers", s: ["Temperature & elevation", "Bank balance contexts"] },
    ],
    Fractions: [
      { t: "Types of Fractions", s: ["Proper & improper", "Mixed numbers", "Equivalent fractions"] },
      { t: "Comparing Fractions", s: ["Like fractions", "Unlike fractions"] },
      { t: "Operations on Fractions", s: ["Addition & subtraction", "Multiplication", "Division"] },
    ],
    Decimals: [
      { t: "Tenths and Hundredths", s: ["Place value", "Decimal fractions"] },
      { t: "Comparing Decimals", s: ["Number line", "Money & length as decimals"] },
      { t: "Operations with Decimals", s: ["Addition & subtraction", "Multiplication by 10, 100"] },
    ],
    "Data Handling": [
      { t: "Recording Data", s: ["Tally marks", "Frequency tables"] },
      { t: "Pictographs", s: ["Reading pictographs", "Drawing pictographs"] },
      { t: "Bar Graphs", s: ["Interpreting bars", "Drawing bar graphs"] },
    ],
    Mensuration: [
      { t: "Perimeter", s: ["Rectangle & square", "Regular shapes"] },
      { t: "Area", s: ["Area of rectangles", "Area as square units"] },
      { t: "Word Problems", s: ["Fencing & flooring costs", "Composite regions"] },
    ],
    Algebra: [
      { t: "Introduction to Variables", s: ["Letters as unknowns", "Simple expressions"] },
      { t: "Equations", s: ["Trial & error method", "Balancing an equation"] },
    ],
    "Ratio and Proportion": [
      { t: "Ratio", s: ["Simplifying ratios", "Comparing quantities"] },
      { t: "Proportion", s: ["Unitary method", "Direct proportion basics"] },
    ],
  },

  "Grade 7": {
    Integers: [
      { t: "Properties of Integer Operations", s: ["Closure & commutativity", "Associativity", "Distributive law"] },
      { t: "Signed Number Practice", s: ["Additive inverse", "Word problems"] },
    ],
    "Fractions and Decimals": [
      { t: "Fraction Operations", s: ["Multiplication of fractions", "Division of fractions"] },
      { t: "Decimal Operations", s: ["Multiplication of decimals", "Division by 10, 100 & whole numbers"] },
      { t: "Applied Problems", s: ["Money calculations", "Measurement conversions"] },
    ],
    "Data Handling": [
      { t: "Collecting and Organising Data", s: ["Choice of representative value", "Mean, median & mode idea"] },
      { t: "Bar Graphs", s: ["Double bar graphs", "Interpreting scales"] },
      { t: "Chance and Probability", s: ["Random experiments", "Equally likely outcomes"] },
    ],
    "Simple Equations": [
      { t: "Setting Up Equations", s: ["From word statements", "From pictures"] },
      { t: "Solving Equations", s: ["Transpose method", "Trial & error check"] },
      { t: "Applications", s: ["Number puzzles", "Age & cost problems"] },
    ],
    "Lines and Angles": [
      { t: "Pairs of Lines", s: ["Intersecting lines", "Transversal"] },
      { t: "Angle Pairs", s: ["Complementary & supplementary", "Vertically opposite angles"] },
      { t: "Parallel Lines Cut by a Transversal", s: ["Corresponding angles", "Alternate interior angles"] },
    ],
    "The Triangle and its Properties": [
      { t: "Triangle Basics", s: ["Median & centroid", "Altitude & orthocentre"] },
      { t: "Angle Sum Property", s: ["Interior angles", "Exterior angle theorem"] },
      { t: "Inequalities in Triangles", s: ["Side-angle relations", "Triangle inequality"] },
      { t: "Right Triangles", s: ["Pythagorean theorem", "Pythagorean triples"] },
    ],
    "Comparing Quantities": [
      { t: "Ratios and Percentages", s: ["Conversion between forms", "Increase & decrease percent"] },
      { t: "Profit and Loss", s: ["Cost & selling price", "Profit-loss percent"] },
      { t: "Simple Interest", s: ["SI formula", "Principal, rate & time"] },
    ],
    "Rational Numbers": [
      { t: "Rational Number Basics", s: ["p/q form", "Standard form", "Number line placement"] },
      { t: "Operations on Rationals", s: ["Addition & subtraction", "Multiplication & division"] },
      { t: "Rationals between Two", s: ["Mean method", "Density property"] },
    ],
    "Perimeter and Area": [
      { t: "Squares and Rectangles", s: ["Area formulas", "Perimeter problems"] },
      { t: "Parallelograms and Triangles", s: ["Area of parallelogram", "Area of triangle"] },
      { t: "Circles", s: ["Circumference", "Area of circle"] },
      { t: "Applied Area", s: ["Paths & borders", "Cost problems"] },
    ],
    "Algebraic Expressions": [
      { t: "Terms of an Expression", s: ["Variables & constants", "Like & unlike terms"] },
      { t: "Addition and Subtraction", s: ["Combining like terms", "Column method"] },
      { t: "Value of Expressions", s: ["Substitution", "Formula evaluation"] },
    ],
    "Exponents and Powers": [
      { t: "Laws of Exponents", s: ["Product & quotient laws", "Power of a power"] },
      { t: "Negative Exponents", s: ["Reciprocal meaning", "Decimal expansion"] },
      { t: "Standard Form", s: ["Scientific notation", "Comparing sizes"] },
    ],
    Symmetry: [
      { t: "Line Symmetry", s: ["Symmetric figures", "Multiple lines of symmetry"] },
      { t: "Rotational Symmetry", s: ["Angle of rotation", "Order of rotation"] },
    ],
    "Visualising Solid Shapes": [
      { t: "Nets and Views", s: ["Front & side views", "Nets of solids"] },
      { t: "Mapping Space", s: ["Faces, edges & vertices", "Euler's relation"] },
    ],
  },

  "Grade 8": {
    "Rational Numbers": [
      { t: "Properties of Rational Numbers", s: ["Closure", "Commutativity & associativity", "Distributivity", "Identities & inverses"] },
      { t: "Representation on Number Line", s: ["Positive & negative rationals", "Fraction to decimal placement"] },
      { t: "Rational Numbers between Two", s: ["Mean method", "n numbers between a and b"] },
    ],
    "Linear Equations in One Variable": [
      { t: "Solving Linear Equations", s: ["Balancing operations", "Variables on both sides", "Fractions & brackets"] },
      { t: "Word Problems", s: ["Number & age problems", "Speed-distance", "Perimeter contexts"] },
    ],
    "Understanding Quadrilaterals": [
      { t: "Polygon Basics", s: ["Angle sum property", "Exterior angles"] },
      { t: "Kinds of Quadrilaterals", s: ["Trapezium & kite", "Parallelogram family"] },
      { t: "Parallelogram Properties", s: ["Diagonals bisect", "Opposite sides & angles equal"] },
    ],
    "Data Handling": [
      { t: "Grouping Data", s: ["Class intervals", "Frequency distribution"] },
      { t: "Graphical Representation", s: ["Histogram", "Pie chart"] },
      { t: "Chance and Probability", s: ["Random experiments", "Equally likely outcomes", "Simple probability"] },
    ],
    "Squares and Square Roots": [
      { t: "Properties of Square Numbers", s: ["Units digit patterns", "Sum of odd numbers"] },
      { t: "Finding Square Roots", s: ["Prime factorisation", "Long division method", "Estimation"] },
      { t: "Square Roots of Decimals & Fractions", s: ["Decimal squares", "Fraction roots"] },
    ],
    "Cubes and Cube Roots": [
      { t: "Cubes", s: ["Perfect cubes", "Units digit patterns"] },
      { t: "Cube Roots", s: ["Prime factorisation method", "Estimation"] },
    ],
    "Comparing Quantities": [
      { t: "Ratios and Percentages", s: ["Increase & decrease", "Discounts"] },
      { t: "Profit, Loss and Discount", s: ["Marked price", "Successive discounts"] },
      { t: "Compound Interest", s: ["CI formula", "Half-yearly compounding", "CI vs SI"] },
      { t: "Applications", s: ["EMI idea", "Growth & depreciation"] },
    ],
    "Algebraic Expressions and Identities": [
      { t: "Multiplying Expressions", s: ["Monomial × binomial", "Binomial × binomial"] },
      { t: "Standard Identities", s: ["(a+b)² and (a−b)²", "a²−b²", "(x+a)(x+b)"] },
      { t: "Applying Identities", s: ["Mental products", "Simplification"] },
    ],
    Mensuration: [
      { t: "Area of Trapezium and Polygons", s: ["Trapezium formula", "Split into triangles"] },
      { t: "Area of Rhombus", s: ["Diagonal formula", "Relation to parallelogram"] },
      { t: "Surface Area of Solids", s: ["Cuboid & cube", "Cylinder"] },
      { t: "Volume of Solids", s: ["Cuboid volume", "Cylinder volume", "Capacity in litres"] },
    ],
    "Exponents and Powers": [
      { t: "Laws with Negative Exponents", s: ["Product & quotient laws", "Power law", "Zero exponent"] },
      { t: "Standard Form", s: ["Very small numbers", "Very large numbers"] },
    ],
    "Direct and Inverse Proportions": [
      { t: "Direct Proportion", s: ["Constant ratio", "Unitary method"] },
      { t: "Inverse Proportion", s: ["Constant product", "Speed-time contexts"] },
    ],
    Factorisation: [
      { t: "Common Factor Method", s: ["HCF extraction", "Grouping"] },
      { t: "Middle-term Splitting", s: ["x² + bx + c", "ax² + bx + c"] },
      { t: "Using Identities", s: ["Difference of squares", "Perfect square trinomials"] },
      { t: "Division of Polynomials", s: ["Factor method", "Long division"] },
    ],
    "Introduction to Graphs": [
      { t: "Linear Graphs", s: ["Coordinates & quadrants", "Plotting points"] },
      { t: "Applications of Graphs", s: ["Quantity vs time", "Cost vs quantity"] },
    ],
    "Playing with Numbers": [
      { t: "Numbers in Generalised Form", s: ["Two-digit ab form", "Reversing digits"] },
      { t: "Divisibility Puzzles", s: ["Generalised tests", "Missing digit puzzles"] },
    ],
  },

  "Grade 9": {
    "Number Systems": [
      { t: "Irrational Numbers", s: ["Non-terminating decimals", "√2 on the number line", "Surds basics"] },
      { t: "Real Numbers and Operations", s: ["Closure on reals", "Rationalisation of denominators"] },
      { t: "Laws of Exponents for Reals", s: ["Fractional exponents", "nth root notation"] },
      { t: "Decimal Expansions", s: ["Terminating", "Non-terminating recurring"] },
    ],
    Polynomials: [
      { t: "Polynomial Basics", s: ["Degree & types", "Value of a polynomial"] },
      { t: "Zeroes of a Polynomial", s: ["Finding roots", "Graphical meaning"] },
      { t: "Remainder Theorem", s: ["Statement & proof idea", "Application problems"] },
      { t: "Factor Theorem", s: ["Factorisation by splitting", "Cubic factorisation"] },
      { t: "Algebraic Identities", s: ["(x+y+z)²", "x³±y³", "x³+y³+z³−3xyz"] },
    ],
    "Coordinate Geometry": [
      { t: "The Cartesian Plane", s: ["Axes & quadrants", "Coordinates of a point"] },
      { t: "Plotting Points", s: ["Sign conventions", "Distance on axes"] },
    ],
    "Linear Equations in Two Variables": [
      { t: "Equation of a Line", s: ["Solutions of ax+by+c=0", "Graphical representation"] },
      { t: "Graphing Lines", s: ["Making a table of values", "Intercepts"] },
    ],
    "Introduction to Euclid's Geometry": [
      { t: "Axioms and Postulates", s: ["Euclid's five postulates", "Definitions vs axioms"] },
      { t: "Equivalent Versions", s: ["Playfair's axiom", "Line through two points"] },
    ],
    "Lines and Angles": [
      { t: "Basic Terms", s: ["Pairs of angles", "Linear pair axiom"] },
      { t: "Parallel Lines", s: ["Corresponding angles axiom", "Alternate & co-interior angles"] },
      { t: "Angle Sum Properties", s: ["Triangle angle sum", "Exterior angle theorem"] },
    ],
    Triangles: [
      { t: "Congruence Criteria", s: ["SAS, ASA, SSS", "RHS criterion"] },
      { t: "Properties of Triangles", s: ["Isosceles triangle theorem", "Angles opposite equal sides"] },
      { t: "Inequalities", s: ["Side inequalities", "Longest side & largest angle"] },
    ],
    Quadrilaterals: [
      { t: "Parallelogram Theorems", s: ["Diagonal properties", "Opposite sides & angles"] },
      { t: "Midpoint Theorem", s: ["Statement & proof", "Converse application"] },
    ],
    Circles: [
      { t: "Chord Properties", s: ["Perpendicular from centre", "Equal chords"] },
      { t: "Angle Subtended", s: ["Angle at centre", "Cyclic quadrilateral property"] },
      { t: "Arcs and Angles", s: ["Angle subtended by an arc", "Segment angles"] },
    ],
    "Heron's Formula": [
      { t: "Area by Heron's Formula", s: ["Semi-perimeter", "Verification with base-height"] },
      { t: "Applied Areas", s: ["Quadrilateral split", "Cost of levelling"] },
    ],
    "Surface Areas and Volumes": [
      { t: "Right Circular Cone", s: ["Curved surface area", "Total surface area"] },
      { t: "Sphere and Hemisphere", s: ["Sphere surface & volume", "Hemisphere formulas"] },
      { t: "Composite Solids", s: ["Cone on cylinder", "Melting & recasting"] },
    ],
    Statistics: [
      { t: "Collection and Presentation", s: ["Frequency distribution", "Bar graphs & histograms"] },
      { t: "Measures of Central Tendency", s: ["Mean", "Median", "Mode"] },
    ],
  },

  "Grade 10": {
    "Real Numbers": [
      { t: "Euclid's Division Lemma", s: ["Statement & use", "HCF by Euclid's algorithm"] },
      { t: "Fundamental Theorem of Arithmetic", s: ["Prime factorisation", "HCF × LCM relation"] },
      { t: "Irrational Numbers", s: ["Irrationality of √2 & √3", "Sum/product cases"] },
      { t: "Decimal Expansions", s: ["Terminating criterion", "Non-terminating recurring proof"] },
    ],
    Polynomials: [
      { t: "Geometrical Meaning of Zeroes", s: ["Graphs of quadratics", "Zeroes as x-intercepts"] },
      { t: "Zeroes and Coefficients", s: ["Sum of zeroes", "Product of zeroes", "Forming polynomial"] },
      { t: "Division Algorithm", s: ["Dividend = divisor × quotient + remainder", "Finding remaining zeroes"] },
    ],
    "Pair of Linear Equations in Two Variables": [
      { t: "Graphical Method", s: ["Unique / infinite / no solutions", "Consistency of the pair"] },
      { t: "Algebraic Methods", s: ["Substitution", "Elimination", "Cross-multiplication"] },
      { t: "Word Problems", s: ["Age & number problems", "Speed-distance", "Fractions & coins"] },
    ],
    "Quadratic Equations": [
      { t: "Solving by Factorisation", s: ["Splitting the middle term", "Zero product rule"] },
      { t: "Quadratic Formula", s: ["Discriminant", "Nature of roots"] },
      { t: "Completing the Square", s: ["Method steps", "Deriving the formula"] },
      { t: "Applied Problems", s: ["Area & speed", "Time & work", "Root verification"] },
    ],
    "Arithmetic Progressions": [
      { t: "AP Basics", s: ["nth term formula", "Common difference"] },
      { t: "Sum of n Terms", s: ["Sum formula", "AP from sum"] },
      { t: "Applications", s: ["Salary increments", "Saving stacks"] },
    ],
    Triangles: [
      { t: "Similar Figures", s: ["Similarity vs congruence", "Basic proportionality (Thales)"] },
      { t: "Similarity Criteria", s: ["AA criterion", "SSS & SAS similarity"] },
      { t: "Areas of Similar Triangles", s: ["Ratio of areas", "Applications"] },
      { t: "Pythagoras Revisited", s: ["Proof via similarity", "Apollonius theorem idea"] },
    ],
    "Coordinate Geometry": [
      { t: "Distance Formula", s: ["Derivation from Pythagoras", "Collinearity & type of triangle"] },
      { t: "Section Formula", s: ["Midpoint", "Centroid", "Ratio division"] },
      { t: "Area of a Triangle", s: ["Determinant method", "Collinearity test"] },
    ],
    "Introduction to Trigonometry": [
      { t: "Trigonometric Ratios", s: ["sin, cos, tan definitions", "Reciprocal ratios"] },
      { t: "Ratios of Standard Angles", s: ["0°, 30°, 45°, 60°, 90°", "Table derivation"] },
      { t: "Trigonometric Identities", s: ["sin²+cos²=1", "sec²−tan²=1", "cosec²−cot²=1"] },
    ],
    "Some Applications of Trigonometry": [
      { t: "Heights and Distances", s: ["Angle of elevation", "Angle of depression", "Two-angle problems"] },
    ],
    Circles: [
      { t: "Tangent to a Circle", s: ["Point of contact", "Tangent ⊥ radius"] },
      { t: "Number of Tangents", s: ["From a point on the circle", "From an external point", "Equal tangents theorem"] },
    ],
    "Areas Related to Circles": [
      { t: "Sector and Segment", s: ["Area of sector", "Length of arc", "Area of segment"] },
      { t: "Combined Figures", s: ["Circle inscribed in polygon", "Rotor shapes"] },
    ],
    "Surface Areas and Volumes": [
      { t: "Combination of Solids", s: ["Cone + hemisphere", "Cylinder + cone"] },
      { t: "Conversion of Solids", s: ["Melting & recasting", "Rate of flow problems"] },
      { t: "Frustum", s: ["Surface area of frustum", "Volume of frustum"] },
    ],
    Statistics: [
      { t: "Mean of Grouped Data", s: ["Direct method", "Assumed mean & step deviation"] },
      { t: "Mode of Grouped Data", s: ["Modal class formula"] },
      { t: "Median of Grouped Data", s: ["Cumulative frequency", "Median class formula"] },
      { t: "Graphical Representation", s: ["Ogive (less than / more than)", "Finding median from ogive"] },
    ],
    Probability: [
      { t: "Classical Probability", s: ["P(E) outcomes", "Complementary events"] },
      { t: "Applications", s: ["Cards & dice", "Random experiments"] },
    ],
  },
};

/* ------------------------------- SCIENCE ------------------------------- */

export const SCIENCE_TOPICS: Record<string, Record<string, TopicSpec[]>> = {
  "Grade 6": {
    "Food: Where Does It Come From?": [
      { t: "Food Sources", s: ["Plant sources", "Animal sources"] },
      { t: "Food Habits", s: ["Herbivores & carnivores", "Omnivores"] },
      { t: "Parts We Eat", s: ["Seeds & roots", "Leaves & fruits"] },
    ],
    "Components of Food": [
      { t: "Nutrients", s: ["Carbohydrates & fats", "Proteins & vitamins", "Minerals"] },
      { t: "Balanced Diet", s: ["Deficiency diseases", "Roughage & water"] },
      { t: "Testing for Nutrients", s: ["Iodine test for starch", "Protein & fat tests"] },
    ],
    "Fibre to Fabric": [
      { t: "Natural Fibres", s: ["Cotton & jute", "Silk & wool"] },
      { t: "Making Yarn", s: ["Spinning", "Weaving & knitting"] },
    ],
    "Sorting Materials into Groups": [
      { t: "Properties of Materials", s: ["Appearance & hardness", "Transparency"] },
      { t: "Grouping", s: ["Soluble & insoluble", "Sink & float"] },
    ],
    "Separation of Substances": [
      { t: "Methods of Separation", s: ["Handpicking & winnowing", "Sieving & filtration"] },
      { t: "Evaporation & Condensation", s: ["Salt from seawater", "Saturated solutions"] },
      { t: "Why Separate?", s: ["Purity needs", "Removing harmful parts"] },
    ],
    "Changes Around Us": [
      { t: "Reversible Changes", s: ["Melting & freezing", "Folding & unfolding"] },
      { t: "Irreversible Changes", s: ["Burning & rusting", "Cooking"] },
    ],
    "Getting to Know Plants": [
      { t: "Plant Parts", s: ["Root & stem", "Leaf & flower"] },
      { t: "Leaf Structure", s: ["Venation", "Stomata"] },
      { t: "Flower Parts", s: ["Sepals & petals", "Stamen & pistil"] },
    ],
    "Body Movements": [
      { t: "The Skeleton", s: ["Bones & joints", "Skull & backbone"] },
      { t: "Movement", s: ["Muscles pull bones", "Fixed & hinge joints"] },
      { t: "Locomotion in Animals", s: ["Walking & crawling", "Flying & swimming"] },
    ],
    "The Living Organisms and Their Surroundings": [
      { t: "Habitats", s: ["Terrestrial & aquatic", "Desert & mountain"] },
      { t: "Adaptations", s: ["Camouflage", "Desert plant features"] },
      { t: "Characteristics of Life", s: ["Growth & respiration", "Response to stimuli"] },
    ],
    "Motion and Measurement of Distances": [
      { t: "Measurement", s: ["Standard units", "SI units"] },
      { t: "Types of Motion", s: ["Linear & circular", "Periodic motion"] },
    ],
    "Light, Shadows and Reflections": [
      { t: "Light Sources", s: ["Luminous objects", "Transparent & opaque"] },
      { t: "Shadows", s: ["Shadow formation", "Eclipses idea"] },
      { t: "Reflection", s: ["Mirrors", "Pinhole camera"] },
    ],
    "Electricity and Circuits": [
      { t: "Electric Cells", s: ["Cell terminals", "Battery"] },
      { t: "Circuits", s: ["Open & closed circuits", "Conductors & insulators"] },
    ],
    "Fun with Magnets": [
      { t: "Magnet Basics", s: ["Poles", "Attraction & repulsion"] },
      { t: "Making Magnets", s: ["Natural magnets", "Compass"] },
    ],
    Water: [
      { t: "Water Cycle", s: ["Evaporation", "Condensation & rain"] },
      { t: "Water Sources", s: ["Groundwater", "Rainwater harvesting"] },
      { t: "Water Conservation", s: ["Wastage prevention", "Floods & droughts"] },
    ],
    "Air Around Us": [
      { t: "Composition of Air", s: ["Oxygen & nitrogen", "Carbon dioxide"] },
      { t: "Uses of Air", s: ["Breathing", "Burning"] },
    ],
    "Garbage In, Garbage Out": [
      { t: "Waste Types", s: ["Biodegradable", "Non-biodegradable"] },
      { t: "Waste Management", s: ["Composting", "Recycling & reuse"] },
    ],
  },

  "Grade 7": {
    "Nutrition in Plants": [
      { t: "Photosynthesis", s: ["Raw materials", "Chlorophyll role", "Leaf adaptations"] },
      { t: "Other Modes of Nutrition", s: ["Saprotrophs", "Parasitic plants", "Insectivorous plants"] },
      { t: "Symbiosis", s: ["Rhizobium & legumes", "Lichens"] },
    ],
    "Nutrition in Animals": [
      { t: "Digestion Steps", s: ["Ingestion & digestion", "Absorption & egestion"] },
      { t: "Human Digestive System", s: ["Mouth & stomach", "Small intestine & villi"] },
      { t: "Digestion in Other Animals", s: ["Amoeba", "Ruminants"] },
    ],
    Heat: [
      { t: "Temperature Measurement", s: ["Thermometers", "Celsius scale"] },
      { t: "Heat Transfer", s: ["Conduction", "Convection", "Radiation"] },
      { t: "Insulation", s: ["Woollen clothes", "Thermos flask"] },
    ],
    "Acids, Bases and Salts": [
      { t: "Identification", s: ["Indicators", "Litmus & turmeric"] },
      { t: "Neutralisation", s: ["Acid + base → salt + water", "Everyday examples"] },
      { t: "Making Salts", s: ["Neutralisation in practice", "Crystallisation"] },
    ],
    "Physical and Chemical Changes": [
      { t: "Physical Changes", s: ["Melting ice", "Dissolving"] },
      { t: "Chemical Changes", s: ["Rusting", "Burning & souring"] },
      { t: "Rusting Prevention", s: ["Painting & galvanising", "Drying"] },
    ],
    "Respiration in Organisms": [
      { t: "Aerobic Respiration", s: ["Glucose breakdown", "Mitochondria role"] },
      { t: "Anaerobic Respiration", s: ["Fermentation", "Muscle cramps"] },
      { t: "Breathing", s: [" Inhalation & exhalation", "Diaphragm action"] },
    ],
    "Transportation in Animals and Plants": [
      { t: "Circulatory System", s: ["Heart & blood vessels", "Blood components"] },
      { t: "Excretion", s: ["Kidneys", "Urine formation"] },
      { t: "Plant Transport", s: ["Xylem", "Phloem & transpiration"] },
    ],
    "Reproduction in Plants": [
      { t: "Pollination", s: ["Self & cross-pollination", "Agents of pollination"] },
      { t: "Fertilisation", s: ["Zygote formation", "Fruit & seed"] },
      { t: "Seed Dispersal", s: ["Wind & water", "Animals & explosion"] },
    ],
    "Motion and Time": [
      { t: "Speed", s: ["Uniform & non-uniform", "Average speed"] },
      { t: "Measuring Time", s: ["Periodic events", "Simple pendulum"] },
      { t: "Distance-Time Graphs", s: ["Slope & speed", "Interpreting graphs"] },
    ],
    "Electric Current and its Effects": [
      { t: "Circuits", s: ["Cells & batteries", "Circuit diagrams"] },
      { t: "Heating Effect", s: ["Filament & fuse", "Heating appliances"] },
      { t: "Magnetic Effect", s: ["Electromagnet", "Electric bell"] },
    ],
    Light: [
      { t: "Reflection of Light", s: ["Plane mirrors", "Image formation"] },
      { t: "Spherical Mirrors", s: ["Concave & convex", "Uses"] },
      { t: "Rainbow & White Light", s: ["Dispersion", "Prism"] },
    ],
    "Forests: Our Lifeline": [
      { t: "Forest Layers", s: ["Canopy & understory", "Forest floor"] },
      { t: "Ecosystem Services", s: ["Oxygen & rainfall", "Soil protection"] },
    ],
    "Wastewater Story": [
      { t: "Wastewater Sources", s: ["Sewage composition", "Diseases from contaminated water"] },
      { t: "Treatment", s: ["Screening & grit removal", "Aeration & chlorination"] },
      { t: "Sanitation", s: ["Septic tanks", "Vermicomposting toilets"] },
    ],
  },

  "Grade 8": {
    "Crop Production and Management": [
      { t: "Agricultural Practices", s: ["Tilling & sowing", "Irrigation"] },
      { t: "Crop Protection", s: ["Weeding", "Pest control"] },
      { t: "Harvest & Storage", s: ["Threshing & winnowing", "Granaries"] },
    ],
    "Microorganisms: Friend and Foe": [
      { t: "Types of Microbes", s: ["Bacteria & viruses", "Fungi & protozoa"] },
      { t: "Useful Roles", s: ["Curding & fermentation", "Nitrogen cycle"] },
      { t: "Harmful Microbes", s: ["Diseases", "Food poisoning & preservation"] },
    ],
    "Coal and Petroleum": [
      { t: "Fossil Fuels", s: ["Formation of coal", "Refining petroleum"] },
      { t: "Products & Uses", s: ["Coal gas & coke", "Fractions of crude oil"] },
      { t: "Conservation", s: ["Exhaustible resources", "Alternate energy"] },
    ],
    "Combustion and Flame": [
      { t: "Combustion", s: ["Conditions needed", "Types of combustion"] },
      { t: "Structure of a Flame", s: ["Zones of a candle", "Luminous vs non-luminous"] },
      { t: "Fuel Efficiency", s: ["Calorific value", "Ignition temperature"] },
    ],
    "Conservation of Plants and Animals": [
      { t: "Deforestation", s: ["Causes", "Consequences"] },
      { t: "Protected Areas", s: ["National parks & sanctuaries", "Biosphere reserves"] },
      { t: "Endangered Species", s: ["Red Data Book", "Migration"] },
    ],
    "Reproduction in Animals": [
      { t: "Sexual Reproduction", s: ["Male & female gametes", "Fertilisation"] },
      { t: "Development", s: ["Embryo & foetus", "Viviparous vs oviparous"] },
      { t: "Asexual Reproduction", s: ["Budding", "Binary fission"] },
    ],
    "Reaching the Age of Adolescence": [
      { t: "Puberty Changes", s: ["Physical changes", "Hormonal triggers"] },
      { t: "Hormones", s: ["Testosterone & estrogen", "Secondary sexual characters"] },
      { t: "Adolescent Health", s: ["Nutrition needs", "Personal hygiene"] },
    ],
    "Force and Pressure": [
      { t: "Force", s: ["Contact forces", "Non-contact forces", "Net force"] },
      { t: "Pressure", s: ["Pressure = force/area", "Liquids & gases exert pressure"] },
      { t: "Atmospheric Pressure", s: ["Effects", "Applications"] },
    ],
    Friction: [
      { t: "Factors Affecting Friction", s: ["Surface roughness", "Normal force"] },
      { t: "Types of Friction", s: ["Static", "Sliding & rolling"] },
      { t: "Increasing & Reducing", s: ["Treads & grooves", "Ball bearings & lubricants"] },
    ],
    Sound: [
      { t: "Production of Sound", s: ["Vibrations", "Propagation in media"] },
      { t: "Characteristics", s: ["Frequency & pitch", "Amplitude & loudness"] },
      { t: "Hearing & Range", s: ["Human ear", "Audible & ultrasound"] },
      { t: "Noise Pollution", s: ["Sources", "Harmful effects & control"] },
    ],
    "Chemical Effects of Electric Current": [
      { t: "Conduction in Liquids", s: ["Electrolytes", "Testing conductivity"] },
      { t: "Electrolysis", s: ["Electroplating", "Decomposition of water"] },
    ],
    "Some Natural Phenomena": [
      { t: "Lightning", s: ["Charge accumulation", "Lightning safety"] },
      { t: "Earthquakes", s: ["Seismic waves", "Richter scale & safety"] },
    ],
    Light: [
      { t: "Reflection Laws", s: ["Incident & reflected rays", "Lateral inversion"] },
      { t: "Regular & Diffuse Reflection", s: ["Mirrors", "Objects around us"] },
      { t: "Multiple Reflections", s: ["Kaleidoscope", "Periscope"] },
      { t: "Human Eye & Care", s: ["Parts of the eye", "Braille & visually impaired"] },
    ],
  },

  "Grade 9": {
    "Matter in Our Surroundings": [
      { t: "States of Matter", s: ["Solid, liquid & gas", "Interconversion"] },
      { t: "Evaporation & Boiling", s: ["Factors affecting evaporation", "Cooling by evaporation"] },
      { t: "Nature of Matter", s: ["Diffusion", "Compressibility"] },
    ],
    "Is Matter Around Us Pure?": [
      { t: "Mixtures and Solutions", s: ["Homogeneous & heterogeneous", "Concentration"] },
      { t: "Separation Techniques", s: ["Filtration & evaporation", "Distillation & chromatography"] },
      { t: "Compounds & Elements", s: ["Chemical vs physical change", "Types of solutions"] },
    ],
    "Atoms and Molecules": [
      { t: "Laws of Chemical Combination", s: ["Conservation of mass", "Constant proportions"] },
      { t: "Atomic Mass & Moles", s: ["Mole concept", "Molar mass"] },
      { t: "Formulae", s: ["Molecular formula", "Writing formulae"] },
    ],
    "Structure of the Atom": [
      { t: "Atomic Models", s: ["Thomson & Rutherford", "Bohr's model"] },
      { t: "Sub-atomic Particles", s: ["Electrons, protons & neutrons", "Atomic number & mass number"] },
      { t: "Electronic Configuration", s: ["Shells & valency", "Isotopes & isobars"] },
    ],
    "The Fundamental Unit of Life": [
      { t: "Cell Structure", s: ["Plasma membrane", "Nucleus & cytoplasm"] },
      { t: "Organelles", s: ["Mitochondria & ER", "Golgi & lysosomes", "Plastids & vacuoles"] },
      { t: "Osmosis & Diffusion", s: ["Hypotonic & hypertonic", "Plasmolysis"] },
    ],
    Tissues: [
      { t: "Plant Tissues", s: ["Meristematic", "Permanent tissues"] },
      { t: "Animal Tissues", s: ["Epithelial", "Connective & muscular", "Nervous tissue"] },
    ],
    Motion: [
      { t: "Describing Motion", s: ["Distance vs displacement", "Uniform & non-uniform motion"] },
      { t: "Equations of Motion", s: ["Graphical derivation", "v = u + at & others"] },
      { t: "Uniform Circular Motion", s: ["Velocity direction", "Centripetal idea"] },
    ],
    "Force and Laws of Motion": [
      { t: "Newton's First Law", s: ["Inertia", "Momentum"] },
      { t: "Second & Third Laws", s: ["F = ma", "Action-reaction pairs"] },
      { t: "Conservation of Momentum", s: ["Collisions", "Recoil applications"] },
    ],
    Gravitation: [
      { t: "Universal Law", s: ["Newton's law", "Free fall"] },
      { t: "Mass vs Weight", s: ["Value of g", "Variation with location"] },
      { t: "Thrust & Buoyancy", s: ["Archimedes' principle", "Density & floatation"] },
    ],
    "Work and Energy": [
      { t: "Work Done", s: ["Positive & negative work", "Zero work"] },
      { t: "Energy Forms", s: ["Kinetic energy", "Potential energy"] },
      { t: "Conservation & Power", s: ["Energy transformations", "Commercial unit kWh"] },
    ],
    Sound: [
      { t: "Production & Propagation", s: ["Longitudinal waves", "Compression & rarefaction"] },
      { t: "Wave Properties", s: ["Wavelength & frequency", "Speed of sound"] },
      { t: "Reflection & Echoes", s: ["Laws of reflection", "Reverberation"] },
      { t: "Applications", s: ["Ultrasound & SONAR", "Human ear range"] },
    ],
    "Improvement in Food Resources": [
      { t: "Crop Improvement", s: ["Variety selection", "Hybridisation"] },
      { t: "Management Practices", s: ["Nutrient supply", "Irrigation & cropping patterns"] },
      { t: "Animal Husbandry", s: ["Cattle & poultry", "Fish & bee-keeping"] },
    ],
  },

  "Grade 10": {
    "Chemical Reactions and Equations": [
      { t: "Writing Equations", s: ["Balancing equations", "States of reactants"] },
      { t: "Types of Reactions", s: ["Combination & decomposition", "Displacement & double displacement"] },
      { t: "Effects", s: ["Exothermic & endothermic", "Oxidation & reduction"] },
      { t: "Everyday Examples", s: ["Corrosion", "Rancidity"] },
    ],
    "Acids, Bases and Salts": [
      { t: "Chemical Properties", s: ["Reactions with metals & carbonates", "Neutralisation"] },
      { t: "pH Scale", s: ["Indicators", "Importance in everyday life"] },
      { t: "Important Salts", s: ["Common salt family", "Baking soda & washing soda", "Plaster of Paris"] },
    ],
    "Metals and Non-metals": [
      { t: "Properties", s: ["Malleability & ductility", "Conductivity & lustre"] },
      { t: "Reactivity Series", s: ["Displacement reactions", "K, Na, Ca reactivity"] },
      { t: "Metallurgy", s: ["Extraction of metals", "Thermite & electrolytic reduction"] },
      { t: "Corrosion & Alloys", s: ["Prevention methods", "Brass & steel"] },
    ],
    "Carbon and its Compounds": [
      { t: "Bonding in Carbon", s: ["Covalent bonds", "Catenation & tetravalency"] },
      { t: "Homologous Series", s: ["Functional groups", "Nomenclature basics"] },
      { t: "Important Compounds", s: ["Ethanol & ethanoic acid", "Soaps & detergents"] },
    ],
    "Periodic Classification of Elements": [
      { t: "Early Attempts", s: ["Dobereiner's triads", "Newlands' octaves"] },
      { t: "Mendeleev's Table", s: ["Merits & anomalies", "Gaps for undiscovered elements"] },
      { t: "Modern Periodic Table", s: ["Atomic number basis", "Trends: valency & size"] },
    ],
    "Life Processes": [
      { t: "Nutrition", s: ["Autotrophic & heterotrophic", "Human digestive system"] },
      { t: "Respiration", s: ["Aerobic vs anaerobic", "Human respiratory system"] },
      { t: "Transportation", s: ["Human heart & vessels", "Plant transport"] },
      { t: "Excretion", s: ["Nephron function", "Plant excretion"] },
    ],
    "Control and Coordination": [
      { t: "Nervous System", s: ["Neuron structure", "Reflex action & arc"] },
      { t: "Human Brain", s: ["Parts & functions", "Protection"] },
      { t: "Coordination in Plants", s: ["Tropisms", "Plant hormones"] },
      { t: "Hormones in Animals", s: ["Endocrine glands", "Feedback control"] },
    ],
    "How do Organisms Reproduce?": [
      { t: "Asexual Reproduction", s: ["Fission & budding", "Fragmentation & spores"] },
      { t: "Sexual Reproduction in Plants", s: ["Flower structure", "Pollination & fertilisation"] },
      { t: "Human Reproduction", s: ["Male & female systems", "Menstrual cycle"] },
      { t: "Reproductive Health", s: ["Contraception", "STDs"] },
    ],
    "Heredity and Evolution": [
      { t: "Mendel's Contributions", s: ["Monohybrid cross", "Dihybrid cross"] },
      { t: "Sex Determination", s: ["Chromosomes", "Human XX/XY"] },
      { t: "Evolution", s: ["Acquired vs inherited traits", "Natural selection", "Homologous organs"] },
      { t: "Tracing Evolution", s: ["Fossils", "Evolution by stages"] },
    ],
    "Light: Reflection and Refraction": [
      { t: "Reflection", s: ["Mirror formula", "Magnification"] },
      { t: "Spherical Mirrors", s: ["Concave & convex images", "Uses"] },
      { t: "Refraction", s: ["Laws of refraction", "Refractive index"] },
      { t: "Lenses", s: ["Lens formula & power", "Image formation"] },
    ],
    "The Human Eye and the Colourful World": [
      { t: "Eye Structure", s: ["Accommodation", "Defects & correction"] },
      { t: "Prisms", s: ["Dispersion", "Recombination"] },
      { t: "Atmospheric Phenomena", s: ["Rainbows", "Scattering & blue sky"] },
    ],
    Electricity: [
      { t: "Current & Potential", s: ["Ohm's law", "Resistance factors"] },
      { t: "Circuits", s: ["Series & parallel resistors", "Ammeter & voltmeter"] },
      { t: "Heating Effects", s: ["Joule's law", "Electric power"] },
    ],
    "Magnetic Effects of Electric Current": [
      { t: "Magnetic Fields", s: ["Field lines", "Solenoid"] },
      { t: "Electromagnets", s: ["Force on conductor", "Electric motor"] },
      { t: "Induction", s: ["Faraday's experiment", "Generator"] },
    ],
    "Sources of Energy": [
      { t: "Conventional Sources", s: ["Fossil fuels", "Thermal & hydel power"] },
      { t: "Alternative Sources", s: ["Solar & wind", "Biogas & biomass"] },
      { t: "Comparisons", s: ["Renewability", "Environmental cost"] },
    ],
    "Our Environment": [
      { t: "Ecosystems", s: ["Food chains & webs", "Trophic levels"] },
      { t: "Human Impact", s: ["Ozone depletion", "Waste management"] },
    ],
    "Management of Natural Resources": [
      { t: "Conservation", s: ["Forests & wildlife", "Dams debates"] },
      { t: "Water Management", s: ["Watersheds", "Rainwater harvesting"] },
      { t: "Sustainable Use", s: ["Coliform index", "3 R's"] },
    ],
  },
};

/* ------------------------------- ENGLISH ------------------------------- */

export const ENGLISH_TOPICS: Record<string, TopicSpec[]> = {
  "Reading Comprehension": [
    { t: "Factual Passages", s: ["Skimming for main idea", "Scanning for detail"] },
    { t: "Discursive Passages", s: ["Author's viewpoint", "Inference questions"] },
    { t: "Vocabulary in Context", s: ["Word meanings", "Context clues"] },
  ],
  "Grammar Essentials": [
    { t: "Tenses", s: ["Simple & continuous", "Perfect tenses"] },
    { t: "Subject-Verb Agreement", s: ["Basic rules", "Tricky subjects"] },
    { t: "Active and Passive Voice", s: ["Conversion rules", "Suitable contexts"] },
    { t: "Reported Speech", s: ["Statements", "Questions & commands"] },
  ],
  "Writing Skills: Notices & Letters": [
    { t: "Notice Writing", s: ["Format & layout", "Word limit discipline"] },
    { t: "Formal Letters", s: ["Complaint letters", "Enquiry & application letters"] },
    { t: "Email Etiquette", s: ["Structure", "Tone"] },
  ],
  "Vocabulary Building": [
    { t: "Word Formation", s: ["Prefixes", "Suffixes"] },
    { t: "Idioms & Phrases", s: ["Common idioms", "Usage in sentences"] },
    { t: "Synonyms & Antonyms", s: ["Using context", "Register"] },
  ],
  "Literature: Prose": [
    { t: "Theme & Plot", s: ["Story elements", "Sequence of events"] },
    { t: "Character Study", s: ["Traits & motives", "Character relationships"] },
    { t: "Literary Devices", s: ["Imagery & metaphor", "Irony & symbolism"] },
  ],
  "Literature: Poetry": [
    { t: "Reading a Poem", s: ["Stanza & rhyme scheme", "Imagery"] },
    { t: "Poetic Devices", s: ["Simile & metaphor", "Alliteration & personification"] },
    { t: "Appreciation", s: ["Central idea", "Tone & mood"] },
  ],
  "Speaking and Listening": [
    { t: "Speaking Skills", s: ["Pronunciation & stress", "Turn-taking in discussion"] },
    { t: "Listening Skills", s: ["Listening for gist", "Note-taking"] },
    { t: "Presentations", s: ["Structure & delivery", "Visual aids"] },
  ],
  "Creative Writing": [
    { t: "Story Writing", s: ["Plot & conflict", "Dialogue & ending"] },
    { t: "Descriptive Writing", s: ["Sensory details", "Show don't tell"] },
    { t: "Diary & Article", s: ["Diary format", "Article structure"] },
  ],
};
