# RitaScript

## Language Elements

### Choice

```
The weather was (sad | gloomy | depressed).
I'm (very | super | really) glad to ((meet | know) you | learn about you).
```

### Weighted Choice

```
The weather was (sad | gloomy [2] | depressed[4]).
```

### Assignment (?)

```
{desc: 'wet and cold'}
$desc=wet and cold
$desc=(wet and cold)

The weather was $desc
```

### Inline Assignment

```
Jane was from $place=(New York | Berlin | Shanghai). 
$place is cold and wet in the winter.
```


```
Jane was from [$place=(New York | Berlin | Shanghai)]. 
$place is cold and wet in the winter.
```

### Symbols

```
/* 'desc' defined in JS or RS */
The weather was $desc
```

### Transforms

```
The group of boys (to run).conjugate()
How many (tooth | menu | child).pluralize() do you have?
How many (tooth | menu | child).pluralize().toUpper() do you have?

// Resolves choice without repeating
How many (tooth | menu | child).norepeat() do you have?

// Resolves choice in sequence
How many (tooth | menu | child).seq() do you have
```

### Conditionals

```
/* 'desc' defined in JS or RS */
{desc='party'} The party was happening
{desc='party', user=$john} The party was happening and John was wearing $John.color.

{adj='positive'} The party was happening :: The party was not happening.
```

### Labels
```
#Opening {
 The Fellow will be expected to teach one course. Apart from focusing on their own research and \
 teaching one course, the Fellow will be expected to give a presentation of their scholarship at the \
 Institute. The Fellow will also be expected to participate in the intellectual life of the community.
}

$Opening=(
 The Fellow will be expected to teach one course. Apart from focusing on their own research and \
 teaching one course, the Fellow will be expected to give a presentation of their scholarship at the \
 Institute. The Fellow will also be expected to participate in the intellectual life of the community.
)
```
