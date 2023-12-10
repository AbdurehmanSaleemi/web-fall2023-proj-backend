import { supabase } from "./supabase.js";

export const getPics = async () => {
    const { data, error } = await supabase
        .storage
        .from('yoga_imgs')
        .list('imgs', {
            limit: 100,
            offset: 0,
            sortBy: { column: 'name', order: 'asc' },
        })
    if (error) {
        console.log(error);
        return;
    }
    let imgs = []
    for (let i = 0; i < data.length; i++) {
        const element = data[i];
        imgs.push(element.name);
    }
    // remove the first element
    imgs.shift();
    return imgs;
};