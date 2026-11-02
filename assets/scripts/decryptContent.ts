    const simpleDecryptContent = (text: string, charShift: number = 5, numberShift: number = 3): string => {
        let result = '';

        for (let i = 0; i < text.length; i++) {
            let c = text[i];

            if (/[a-zA-Z]/.test(c)) {
                let offset = (c === c.toUpperCase()) ? 'A'.charCodeAt(0) : 'a'.charCodeAt(0); 
                result += String.fromCharCode(
                    ((c.charCodeAt(0) - charShift - offset - i % 10 + 26) % 26) + offset
                );
            } else if (/\d/.test(c)) {
                let num = c.charCodeAt(0) - '0'.charCodeAt(0);
                result += String.fromCharCode(
                    ((num - numberShift + 10) % 10) + '0'.charCodeAt(0)
                );
            } else {
                result += c;
            }
        }

        return result;
    }